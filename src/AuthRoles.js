import  _ from "lodash";
const Auth = require("./Auth").Auth;
const RestQuery = require('./RestQuery');

interface RoleChildParentMapItem {name: String, objectId: String, ACL: Object, parents: Set, result: OppResult}
interface RoleChildParentMap { objectId: RoleChildParentMapItem }

// Operation results for role
const OppResult = Object.freeze({
  rejected: 0,      // role rejected (no path to role was found valid)
  accepted: 1,      // role accepted (at least one path to role was valid)
  processing: 2     // role is being validated (this prevents circular roles)
});

/**
 * Builds the role info object to be used.
 * @param {String} name the name of the role
 * @param {String} objectId the role id
 * @param {Set} parents the available paths for this role. (Parent Roles)
 * @param {OppResult} oppResult the role acl computation result
 */
const RoleInfo = (name, objectId, ACL, parents: Set, oppResult = null) => ({
  name,
  objectId,
  ACL,
  parents,
  oppResult
});

export class AuthRoles {
  /**
   * @param {Auth} auth the Auth object performing the request
   * @param {*} masterAuth used in queries
   */
  constructor(masterAuth: Auth, userId: String){
    this.masterAuth = masterAuth;
    this.userId = userId;
    // final list of accessible role names
    this.accessibleRoleNames = new Set();
    // Contains a relation between the role blocking and the roles that are blocked.
    // This will speedup things when we re-accept a previously rejected role.
    this.blockingRoles = { string: Set };
  }

  /**
   * Returns a promise that resolves with all 'accessibleRoleNames'.
   */
  findRoles(){
    return this.findDirectRoles()
      .then((roles) => this.findRolesOfRoles(roles))
      .then((roleMap) => this.computeAccess(roleMap))
      .then(() => Promise.resolve(Array.from(this.accessibleRoleNames)));
  }

  /**
   * Resolves with a promise once all direct roles are fetched.
   * Direct roles are roles the user is in the 'users' relation.
   * @returns {Promise} Array of Role objects fetched from db.
   */
  findDirectRoles(): Promise<Array>{
    var restWhere = { 'users': {  __type: 'Pointer', className: '_User', objectId: this.userId } };
    var query = _getRolesQuery(restWhere, this.masterAuth);
    return query.execute().then((response) => Promise.resolve(response.results));
  }

  /**
   * Given a list of roles, find all the parent roles.
   * @param {Array} roles array of role objects fetched from db
   * @returns {Promise} RoleChildParentMap
   */
  findRolesOfRoles(roles): Promise<RoleChildParentMap>{
    const map: RoleChildParentMap = {};
    const ids: Set = new Set();

    // map the current roles we have
    _.forEach(roles, role => {
      const roleId = role.objectId;
      ids.add(roleId);
      map[roleId] = RoleInfo(role.name, role.objectId, role.ACL, new Set());
    });

    // the iterator we will use to loop through the ids from set
    const idsIterator = ids[Symbol.iterator]();
    return this._findAndBuildRolesForRolesRecursivelyOntoMap(idsIterator, ids, map, this.masterAuth);
  }

  /**
   * Iterates over each branch to resolve each role's accessibility.
   * Branch will be looped through from inside out, and each
   * node ACL will be validated for accessibility
   * ex: Roles are fetched in this order:
   *  Admins -> Collaborators -> Members
   * Iteration will occure in the opposite order:
   *  Admins <- Collaborators <- Members
   * @param {RoleChildParentMap} map our role map
   * @returns {Promise}
   */
  computeAccess(map: RoleChildParentMap): Promise<void>{
    return new Promise((resolve) => {
      _.forEach(map, (role) => {
        const roleResult: OppResult = this.computeAccessOnRole(role, map);
        // do a bunch of stuff only when role is accepted.
        if(roleResult === OppResult.accepted){
          // add to role name set.
          this.accessibleRoleNames.add("role:" + role.name);
          // solve previous role blames if any available.
          this.solveRoleRejectionBlamesIfAny(role, map);
        }
      });
      resolve();
    });
  }

  /**
   * Determins the role's accessibility status.
   * Both Statements should be true:
   * 1 - At least one path to role is accessible by this user
   * 2 - Role ACl is accesible by this user
   * @param {RoleChildParentMapItem} role the role to compute on
   * @param {RoleChildParentMap} rolesMap our role map
   * @returns {OppResult}
   */
  computeAccessOnRole(role: RoleChildParentMapItem, rolesMap: RoleChildParentMap): OppResult{
    const acl = role.ACL;
    // Dont bother checking if the ACL
    // is empty or corrupt
    if(acl === {} || !acl){
      return OppResult.rejected;
    }
    // assume role is rejected
    var result = OppResult.rejected;
    if(role.result === OppResult.processing){
      // This role(path) is currently being processed.
      // This mean that we stubled upon a circular path.
      // So we reject the role for now.
      // ex: R3* <- R2 <- R3* <- R1
      result = OppResult.rejected;
    }else if(role.result === OppResult.rejected){
      result = OppResult.rejected;
    }else if(role.result === OppResult.accepted){
      result = OppResult.accepted;
    }else{
      // mark processing
      role.result = OppResult.processing;
      // Paths are computed following 'or' logic
      // only one path to a role is sufficient to accept the role.
      // If no parents, the role is directly accessible, we just need
      // to check its ACL.
      var parentPathsResult = OppResult.accepted;
      if(role.parents.size > 0){
        // check the paths that leads to this role using our Map.
        parentPathsResult = this.isAnyPathToRoleValid(role, rolesMap);
      }
      // if the parent's path is accepted or there
      // is no parent path. Lets check the role's ACL.
      if(parentPathsResult === OppResult.accepted){
        if(this.isRoleAclAccessible(role) === true){
          result = OppResult.accepted;
        }else{
          result = OppResult.rejected;
        }
      }else{
        result = parentPathsResult;
      }
    }

    role.result = result;
    return result;
  }


  /**
   * Determins if any of the role's paths (parents) is a valid path.
   * @param {RoleChildParentMapItem} role the role to compute on
   * @param {RoleChildParentMap} rolesMap our role map
   * @returns {OppResult} (Accepted | Rejected)
   */
  isAnyPathToRoleValid(role: RoleChildParentMapItem, rolesMap: RoleChildParentMap): OppResult{
    const parentIds: Set = role.parents;
    const iterator = parentIds[Symbol.iterator]();
    const size = parentIds.size;
    // compute each path individually, and brake as soon
    // as we have a good one.
    for (let index = 0; index < size; index++) {
      const parentId = iterator.next().value;
      const parentRole = rolesMap[parentId];
      if(!parentRole){
        continue;
      }
      // compute access on current parent path node like for any
      // other role normally.
      const pathResult = this.computeAccessOnRole(parentRole, rolesMap);
      if(pathResult === OppResult.accepted){
        // path accepted, skip all other paths and return.
        // any previous rejection that were issued will be dealt with later.
        return OppResult.accepted;
      }
      // Mark our 'role' as rejected by 'parentRole'
      this.blameRoleForRejection(role, parentRole);
    }
    return OppResult.rejected;
  }

  /**
   * A role is accessible when any of the following statements is valid:
   * 1- Role is publicly accessible
   * 2- User is explicitly given access to the role
   * 3- Role has access to itself
   * 4- Role is accessible from other roles we have
   * @param {RoleChildParentMapItem} role the role to check.
   * @returns {Boolean} accessible or not
   */
  isRoleAclAccessible(role): boolean{
    const acl = role.ACL;
    // (1)
    if(_isAclAccessibleFromRoleName(acl, "*")){
      return true;
    }
    // (2)
    if(_isAclAccessibleFromRoleName(acl, this.userId)){
      return true;
    }
    // (3)
    if(_isAclAccessibleFromRoleName(acl, `role:${role.name}`)){
      return true;
    }
    // (4)
    if(_isAclAccessibleFromRoleNames(acl, this.accessibleRoleNames)){
      return true;
    }
    return false;
  }

  /**
   * Adds relationship between the role that is blocking another role.
   * Usually Parent is blocking Child.
   * @param {RoleChildParentMapItem} roleThatWasRejected the role that was just rejected
   * @param {RoleChildParentMapItem} roleThatCausedTheRejection the role that caused this rejection
   */
  blameRoleForRejection(roleThatWasRejected, roleThatCausedTheRejection): void{
    const roleThatCausedTheRejectionId = roleThatCausedTheRejection.objectId;
    const roleThatWasRejectedId = roleThatWasRejected.objectId;
    // other rejections from same role ?
    const otherRejections: Set = this.blockingRoles[roleThatCausedTheRejectionId];
    if(otherRejections){
      otherRejections.add(roleThatWasRejectedId);
    }else{
      this.blockingRoles[roleThatCausedTheRejectionId] = new Set([roleThatWasRejectedId]);
    }
  }

  /**
  * This will iterate over all roles that the 'roleThatWasSolved' is blocking and accept them if possible.
  * @param {RoleChildParentMapItem} roleThatWasSolved previous role that was blocked and may be blocking other roles too.
  */
  solveRoleRejectionBlamesIfAny(roleThatWasSolved: RoleChildParentMapItem, map: RoleChildParentMap): void{
    const roleThatWasSolvedId = roleThatWasSolved.objectId;
    // Get previous rejections if any
    const previousRejections: Set = this.blockingRoles[roleThatWasSolvedId];
    if(previousRejections){
      // loop throught the roles and retry their access
      previousRejections.forEach((roleId) => {
        const role: RoleChildParentMapItem = map[roleId];
        // is he still blocked ?
        if(role && role.result !== OppResult.accepted){
          // is his acl accessible now ?
          if(this.isRoleAclAccessible(role)){
            // accept role
            role.result = OppResult.accepted;
            this.accessibleRoleNames.add(role.name);
            // do the same fo that role
            this.solveRoleRejectionBlamesIfAny(role, map);
          }
        }
      });
    }
  }

  /**
   * Given a set of role Ids, will recursively find all parent roles.
   * @param {Iterator} idsIterator what is used to iterate over 'ids'
   * @param {Set} ids the set of role ids to iteratre on
   * @param {RoleChildParentMap} currentMapState our role map
   * @param {Auth} masterAuth
   */
  _findAndBuildRolesForRolesRecursivelyOntoMap(idsIterator, ids: Set, currentMapState: RoleChildParentMap, masterAuth: Auth){
    // get the next id to operate on
    const parentRoleId = idsIterator.next().value;
    // no next id on iteration, we are done !
    if(!parentRoleId){
      return Promise.resolve(currentMapState);
    }
    // build query and find Roles
    const restWhere = { 'roles': {  __type: 'Pointer', className: '_Role', objectId: parentRoleId } };
    const query = _getRolesQuery(restWhere, masterAuth);
    return query.execute()
      .then((response) => {
        const roles = response.results;
        // map roles linking them to parent
        _.forEach(roles, role => {
          const childRoleId = role.objectId;
          // add to set to use it later on.
          // circular roles are cut since 'Set' will not add it.
          // So no role will be fetched twice.
          ids.add(childRoleId);
          // add to role map
          const roleMap: RoleChildParentMapItem = currentMapState[childRoleId];
          if(roleMap){
            // we already have a parent for this role
            // lets add another one
            roleMap.parents.add(parentRoleId);
          }else{
            // new role
            currentMapState[childRoleId] = RoleInfo(role.name, childRoleId, role.ACL, new Set([parentRoleId]));
          }
        });
        // find the next ones
        return this._findAndBuildRolesForRolesRecursivelyOntoMap(idsIterator, ids, currentMapState, masterAuth);
      });
  }
}

/**
 * A helper method to return the query to execute on _Role class
 * @param {Object} restWhere query constraints
 * @param {Auth} masterAuth the master auth we will be using
 */
const _getRolesQuery = (restWhere = {}, masterAuth: Auth) => {
  return new RestQuery(masterAuth.config, masterAuth, '_Role', restWhere, {});
}

/**
 * Checks if ACL grants access from a Set of roles.
 * Only one role is sufficient.
 * @param {*} acl the acl to check
 * @param {*} roleNames the role names to compute accessibility on 'acl'
 * @returns {Boolean}
 */
const _isAclAccessibleFromRoleNames = (acl, roleNames: Set) => {
  var isNotAccessible = true;
  _.every(acl, (value, key) => {
    // match name from ACL Key
    if(roleNames.has(key)){
      // brake when found
      isNotAccessible = !(_isReadableAcl(value));
    }
    return isNotAccessible;
  })
  return !(isNotAccessible);
}

/**
 * Checks if ACL grants access for a specific role name.
 * @param {*} acl the acl to check
 * @param {*} roleName the role name to compute accessibility on 'acl'
 * @returns {Boolean}
 */
const _isAclAccessibleFromRoleName = (acl, roleName) => {
  const statement = acl[roleName];
  if(statement){
    return _isReadableAcl(statement);
  }
  return false;
}

/**
 * Checks if acl statement is readable.
 * "read" is true
 * @returns {Boolean}
 */
const _isReadableAcl = (statement) => statement.read === true;
