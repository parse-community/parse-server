/*eslint no-console: ["error", { allow: ["warn", "log", "error"] }] */

const RestQuery = require('./RestQuery');
import  _ from "lodash";
import Auth from "./Auth";

// operation result for role
const OppResult = {
  rejected: 0,      // role rejected (no path to role was valid)
  accepted: 1,      // role accepted (at least one path to role was valid)
  inconclusive: 2,  // circular
  processing: 3     // role is being validated (this prevents circular roles)
}

// add only uniquely to array
const addIfNeed = function(array, string){
  if(_.indexOf(array, string) === -1){
    array.push(string)
  }
}

export function AuthRoles(auth: Auth, master, isMaster = false) {
  this.auth = auth
  this.userId = auth.user ? auth.user.id : undefined
  this.master = master
  this.isMaster = isMaster;
  // manifest contains each role
  // keyed to its objectId for fast access
  // { id: { roleInfo } }
  // roleInfo :
  // - name: role name
  // - objectId: role id
  // - parents[]: the available paths to this role, since
  //              some roles can be accessed via multiple paths.
  //              Paths are simply a way to have access to the role by hierarchy aka'<Role Relation>'
  // - tag (OppResult)
  this.manifest = {}
  // array of objectIds pending computation
  this.toCompute = []
  // array of objectIds already computed
  this.computed = []
  // array of role names and ids the user have access to
  this.accessibleRoles = { ids: [],  names: [] }
  // Contains the role that is blocking another role.
  // It is used to quicky re-accept roles that were previously
  // rejected because another role has been rejected or inconclusive.
  // { roleBlocking : [ rolesBlocked ] }
  this.rejections = {}
}

// returns a promise that resolves with 'accessibleRoles'
// once all roles are computed
AuthRoles.prototype.findRoles = function() {
  return this.findDirectRoles()
    .then(() => this.findRolesOfRolesRecursively())
    .then(() => this.computeAccess())
    .then(() => this.cleanup())
    .then(() => Promise.resolve(this.accessibleRoles))
}

// Note: not sure if this is needed
AuthRoles.prototype.cleanup = function() {
  delete this.manifest
  delete this.toCompute
  delete this.computed
  delete this.rejections
}

/**
 * Resolves with a promise once all direct roles are fetched.
 * Direct roles are roles the user is in the 'users' relation.
 */
AuthRoles.prototype.findDirectRoles = function() {
  var restWhere = { 'users': {  __type: 'Pointer', className: '_User', objectId: this.userId } };
  var query = new RestQuery(this.auth.config, this.master, '_Role', restWhere, {})
  return query.execute()
    .then((response) => {
      var directRoles = response.results
      this.addToManifest(directRoles)
    })
}

/**
 * Resolves with a promise once all roles inherited by a role are fetched.
 * Inherited roles are roles a single role has access to by the 'roles' relation.
 */
AuthRoles.prototype.findRolesOfRolesRecursively = function() {
  if(this.toCompute.length == 0){ return Promise.resolve() }

  const roleIdToCompute = this.toCompute[0]
  // Here we have to perform one-by-one, we cannot use $in since we need to know the parent
  // of each role fetched to properly process the tree.
  const restWhere = { 'roles': {  __type: 'Pointer', className: '_Role', objectId: roleIdToCompute } };
  const query = new RestQuery(this.auth.config, this.master, '_Role', restWhere, {});
  return query.execute()
    .then((response) => {
      // console.log('Roles for', this.manifest[roleIdToCompute], response);
      // remove from pending
      _.pullAt(this.toCompute, [0])
      // add to computed
      addIfNeed(this.computed, roleIdToCompute)
      // add new roles to manifest and link to parent
      const roles = response.results
      this.addToManifest(roles, roleIdToCompute)
      // next iteration
      return this.findRolesOfRolesRecursively()
    })
}

// add new roles to manifest
AuthRoles.prototype.addToManifest = function(roles, parentId = undefined){
  _.forEach(roles, (element) => {
    // prevents circular roles from being added twice
    const objectId = element.objectId
    if(this.manifest[objectId] === undefined){
      this.manifest[objectId] = {
        name: element.name,
        objectId,
        ACL: element.ACL,
        parents: parentId ? [ parentId ] : []
      }
      addIfNeed(this.toCompute, objectId)
    }else{
      // this is the second path to this role
      addIfNeed(this.manifest[objectId].parents, parentId)
    }
  })
}

/**
 * Iterates over each branch to resolve roles accessibility.
 * Branch will be looped through from inside out, and each
 * node ACL will be validated for accessibility
 * ex: Roles are fetched in this order:
 *  Admins -> Collaborators -> Members
 * Iteration will occure in the opposite order:
 *  Admins <- Collaborators <- Members
 */
AuthRoles.prototype.computeAccess = function() {
  return new Promise((resolve) => {
    _.forEach(this.manifest, (role) => {
      // console.log("")
      // console.log("Computing Access for role ... ", role.name);
      this.computeAccessOnRole(role)
    })
    resolve()
  })
}

/**
 * Determins the role's acl status.
 * Returns accepted, rejected or inconclusive
 */
AuthRoles.prototype.computeAccessOnRole = function(role){
  // assume role is rejected
  var result = OppResult.rejected

  if(role.tag === OppResult.processing){
    // this role(path) is dependent on a role we are
    // currently processing. It is considered circular (inconclusive)
    // ex: R3* <- R2 <- R3* <- R1
    result = OppResult.inconclusive
    // console.warn("         -> Role Already being processed");
  }else if(role.tag === OppResult.rejected){
    result = OppResult.rejected
    // console.error("         -> Role Already rejected");
  }else if(role.tag === OppResult.accepted){
    result = OppResult.accepted
    // console.log("         -> Role Already accepted");
  }else{
    // mark processing
    role.tag = OppResult.processing

    // console.log(" (role parents ", role.parents,")")

    // paths are computed following 'or' logic
    // only one path to a role is sufficient to accept the role
    // if no parent, the role is directly accessible.
    if(role.parents.length == 0){
      // check role's accessibility for his ACL
      if(this.isRoleAccessible(role)){
        result = OppResult.accepted
      }else{
        result = OppResult.rejected
      }
    }else{
      // otherwise, check paths
      result = this.isAnyPathValid(role)
      // if at least one path is valid
      // lets rely on the role's own acl
      if(result == OppResult.accepted){
        // check role's accessibility for his ACL
        if(this.isRoleAccessible(role)){
          result = OppResult.accepted
        }else{
          result = OppResult.rejected
        }
      }
    }
  }
  // update role tag
  role.tag = result
  // register keys if role is accepted
  if(role.tag == OppResult.accepted){
    addIfNeed(this.accessibleRoles.ids, role.objectId)
    addIfNeed(this.accessibleRoles.names, "role:" + role.name)
    this.resolvePreviousRejectionsIfPossible(role)
  }
  return result
}

/**
 * Links conflicts. Roles that blocks other roles
 */
AuthRoles.prototype.markRejected = function(roleBlocking, roleThatIsBlocked){
  // console.log(roleBlocking.name," is blocking ", roleThatIsBlocked.name);
  const roleBlockingId = roleBlocking.objectId;
  const roleThatIsBlockedId = roleThatIsBlocked.objectId;
  if(this.rejections[roleBlockingId]){
    addIfNeed(this.rejections[roleBlockingId], roleThatIsBlockedId)
  }else{
    this.rejections[roleBlockingId] = [ roleThatIsBlockedId ]
  }
}

/**
 * Loops through previous roles that were rejected because of the
 * role that was just accepted and re operate on that role.
 */
AuthRoles.prototype.resolvePreviousRejectionsIfPossible = function(roleThatWasJustAccepted){
  const rejections = this.rejections[ roleThatWasJustAccepted.objectId ]
  // console.log('Trying to resolve ...', rejections);
  if(rejections){
    _.forEach(rejections, (previouslyRejectedRoleIdByTheOneThatWasJustAccepted) => {
      const role = this.manifest[ previouslyRejectedRoleIdByTheOneThatWasJustAccepted ]
      if(role.tag !== OppResult.accepted){
        // // console.log('Can Resolve');
        role.tag = OppResult.accepted;
        this.resolvePreviousRejectionsIfPossible(role)
      }
    })
  }
}


// Returns :
// inconclusive, rejected or accepted
AuthRoles.prototype.isAnyPathValid = function(role){
  const parentIds = role.parents
  // assume rejected
  var finalResult = OppResult.rejected
  // compute each path individually
  for (let index = 0; index < parentIds.length; index++) {
    const parentId = parentIds[index];
    const parentRole = this.manifest[parentId]
    // console.log("         ...checking path", parentRole.name, "(", parentRole.objectId ,")")
    if(!parentRole) continue;

    const pathResult = this.computeAccessOnRole(parentRole)
    if(pathResult === OppResult.accepted){
      // console.log("         accepted")
      // path accepted, skip all other paths and return
      return OppResult.accepted
    }else if(pathResult === OppResult.rejected){
      // console.error("         rejected")
      // path rejected, but prioritize inconclusive over
      // rejected.
      if(finalResult !== OppResult.inconclusive){
        finalResult = OppResult.rejected
      }
    }else if(pathResult === OppResult.inconclusive){
      // console.log("         inconclusive")
      finalResult = OppResult.inconclusive
    }

    // mark that our 'role' has been rejected by 'parentRole'
    if(pathResult !== OppResult.accepted){
      this.markRejected(parentRole, role)
    }
  }
  return finalResult
}

// A role is accessible when any of the following statements is valid :
// 1- User is explicitly given access to the role
// 2- Role has access to itself
// 3- Role is accessible from other roles we have
// 4- Role is publicly accessible
AuthRoles.prototype.isRoleAccessible = function(role){
  if(this.isMaster === true) return true;
  const acl = role.ACL;
  const userRoles = this.accessibleRoles.names
  // console.log("                     ##isRoleAccessible?", role.name, acl)
  // (5)
  if(acl === {} || !acl){
    // console.log("                     ##NO ACL")
    return false
  }
  // (1)
  if(isAnyExplicitlyGranted(acl, [this.userId])){
    // console.log("                     ##User Explicitly Granted")
    return true
  }
  // (2, 4)
  if(isAnyExplicitlyGranted(acl, ["*", "role:" + role.name])){
    // console.log("                     ##Role/Public Explicitly Granted")
    return true
  }
  // (3)
  if(isAnyExplicitlyGranted(acl, userRoles)){
    // console.log("                     ##Inherited from roles we have")
    return true
  }

  // console.log("                     ##NO")
  return false
}

// Or
function isAnyExplicitlyGranted(acl, roleNames){
  for (let index = 0; index < roleNames.length; index++) {
    const name = roleNames[index];
    const statement = acl[name]
    if(statement){
      if(statement["read"] === true) return true
    }
  }
  return false
}
