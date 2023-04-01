"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.RedisPubSub = void 0;
var _redis = require("redis");
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
function createPublisher({
  redisURL,
  redisOptions = {}
}) {
  redisOptions.no_ready_check = true;
  return (0, _redis.createClient)(_objectSpread({
    url: redisURL
  }, redisOptions));
}
function createSubscriber({
  redisURL,
  redisOptions = {}
}) {
  redisOptions.no_ready_check = true;
  return (0, _redis.createClient)(_objectSpread({
    url: redisURL
  }, redisOptions));
}
const RedisPubSub = {
  createPublisher,
  createSubscriber
};
exports.RedisPubSub = RedisPubSub;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJjcmVhdGVQdWJsaXNoZXIiLCJyZWRpc1VSTCIsInJlZGlzT3B0aW9ucyIsIm5vX3JlYWR5X2NoZWNrIiwiY3JlYXRlQ2xpZW50IiwidXJsIiwiY3JlYXRlU3Vic2NyaWJlciIsIlJlZGlzUHViU3ViIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0FkYXB0ZXJzL1B1YlN1Yi9SZWRpc1B1YlN1Yi5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBjcmVhdGVDbGllbnQgfSBmcm9tICdyZWRpcyc7XG5cbmZ1bmN0aW9uIGNyZWF0ZVB1Ymxpc2hlcih7IHJlZGlzVVJMLCByZWRpc09wdGlvbnMgPSB7fSB9KTogYW55IHtcbiAgcmVkaXNPcHRpb25zLm5vX3JlYWR5X2NoZWNrID0gdHJ1ZTtcbiAgcmV0dXJuIGNyZWF0ZUNsaWVudCh7IHVybDogcmVkaXNVUkwsIC4uLnJlZGlzT3B0aW9ucyB9KTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlU3Vic2NyaWJlcih7IHJlZGlzVVJMLCByZWRpc09wdGlvbnMgPSB7fSB9KTogYW55IHtcbiAgcmVkaXNPcHRpb25zLm5vX3JlYWR5X2NoZWNrID0gdHJ1ZTtcbiAgcmV0dXJuIGNyZWF0ZUNsaWVudCh7IHVybDogcmVkaXNVUkwsIC4uLnJlZGlzT3B0aW9ucyB9KTtcbn1cblxuY29uc3QgUmVkaXNQdWJTdWIgPSB7XG4gIGNyZWF0ZVB1Ymxpc2hlcixcbiAgY3JlYXRlU3Vic2NyaWJlcixcbn07XG5cbmV4cG9ydCB7IFJlZGlzUHViU3ViIH07XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBO0FBQXFDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFFckMsU0FBU0EsZUFBZSxDQUFDO0VBQUVDLFFBQVE7RUFBRUMsWUFBWSxHQUFHLENBQUM7QUFBRSxDQUFDLEVBQU87RUFDN0RBLFlBQVksQ0FBQ0MsY0FBYyxHQUFHLElBQUk7RUFDbEMsT0FBTyxJQUFBQyxtQkFBWTtJQUFHQyxHQUFHLEVBQUVKO0VBQVEsR0FBS0MsWUFBWSxFQUFHO0FBQ3pEO0FBRUEsU0FBU0ksZ0JBQWdCLENBQUM7RUFBRUwsUUFBUTtFQUFFQyxZQUFZLEdBQUcsQ0FBQztBQUFFLENBQUMsRUFBTztFQUM5REEsWUFBWSxDQUFDQyxjQUFjLEdBQUcsSUFBSTtFQUNsQyxPQUFPLElBQUFDLG1CQUFZO0lBQUdDLEdBQUcsRUFBRUo7RUFBUSxHQUFLQyxZQUFZLEVBQUc7QUFDekQ7QUFFQSxNQUFNSyxXQUFXLEdBQUc7RUFDbEJQLGVBQWU7RUFDZk07QUFDRixDQUFDO0FBQUMifQ==