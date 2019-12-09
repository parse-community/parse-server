"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Event = void 0;

var _graphql = require("graphql");

const Event = new _graphql.GraphQLEnumType({
  name: 'event',
  values: {
    create: {
      value: "create",
      description: "This event means a ParseObject is created and it fulfills the ParseQuery"
    },
    enter: {
      value: "enter",
      description: "This event means a ParseObject's old value does not fulfill the ParseQuery but its new value fulfills the ParseQuery"
    },
    update: {
      value: "update",
      description: "This event means a ParseObject's old value and its new value fulfill the ParseQuery at the same time"
    },
    leave: {
      value: "leave",
      description: "This event means a ParseObject's old value fulfills the ParseQuery but its new value does not"
    },
    delete: {
      value: "delete",
      description: "This event means a ParseObject's whose value fulfills the ParseQuery is deleted"
    }
  }
});
exports.Event = Event;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9ncmFwaHFsL3R5cGVzL0V2ZW50LmpzIl0sIm5hbWVzIjpbIkV2ZW50IiwiR3JhcGhRTEVudW1UeXBlIiwibmFtZSIsInZhbHVlcyIsImNyZWF0ZSIsInZhbHVlIiwiZGVzY3JpcHRpb24iLCJlbnRlciIsInVwZGF0ZSIsImxlYXZlIiwiZGVsZXRlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBRU8sTUFBTUEsS0FBSyxHQUFHLElBQUlDLHdCQUFKLENBQW9CO0FBQ3hDQyxFQUFBQSxJQUFJLEVBQUUsT0FEa0M7QUFFeENDLEVBQUFBLE1BQU0sRUFBRTtBQUNOQyxJQUFBQSxNQUFNLEVBQUU7QUFDTkMsTUFBQUEsS0FBSyxFQUFFLFFBREQ7QUFFTkMsTUFBQUEsV0FBVyxFQUFFO0FBRlAsS0FERjtBQUtOQyxJQUFBQSxLQUFLLEVBQUU7QUFDTEYsTUFBQUEsS0FBSyxFQUFFLE9BREY7QUFFTEMsTUFBQUEsV0FBVyxFQUFFO0FBRlIsS0FMRDtBQVNORSxJQUFBQSxNQUFNLEVBQUU7QUFDTkgsTUFBQUEsS0FBSyxFQUFFLFFBREQ7QUFFTkMsTUFBQUEsV0FBVyxFQUFFO0FBRlAsS0FURjtBQWFORyxJQUFBQSxLQUFLLEVBQUU7QUFDTEosTUFBQUEsS0FBSyxFQUFFLE9BREY7QUFFTEMsTUFBQUEsV0FBVyxFQUFFO0FBRlIsS0FiRDtBQWlCTkksSUFBQUEsTUFBTSxFQUFFO0FBQ05MLE1BQUFBLEtBQUssRUFBRSxRQUREO0FBRU5DLE1BQUFBLFdBQVcsRUFBRTtBQUZQO0FBakJGO0FBRmdDLENBQXBCLENBQWQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBHcmFwaFFMRW51bVR5cGUgfSBmcm9tICdncmFwaHFsJztcblxuZXhwb3J0IGNvbnN0IEV2ZW50ID0gbmV3IEdyYXBoUUxFbnVtVHlwZSh7XG5cdG5hbWU6ICdldmVudCcsXG5cdHZhbHVlczoge1xuXHQgIGNyZWF0ZToge1xuXHQgICAgdmFsdWU6IFwiY3JlYXRlXCIsXG5cdCAgICBkZXNjcmlwdGlvbjogXCJUaGlzIGV2ZW50IG1lYW5zIGEgUGFyc2VPYmplY3QgaXMgY3JlYXRlZCBhbmQgaXQgZnVsZmlsbHMgdGhlIFBhcnNlUXVlcnlcIlxuXHQgIH0sXG5cdCAgZW50ZXI6IHtcblx0ICAgIHZhbHVlOiBcImVudGVyXCIsXG5cdCAgICBkZXNjcmlwdGlvbjogXCJUaGlzIGV2ZW50IG1lYW5zIGEgUGFyc2VPYmplY3QncyBvbGQgdmFsdWUgZG9lcyBub3QgZnVsZmlsbCB0aGUgUGFyc2VRdWVyeSBidXQgaXRzIG5ldyB2YWx1ZSBmdWxmaWxscyB0aGUgUGFyc2VRdWVyeVwiXG5cdCAgfSxcblx0ICB1cGRhdGU6IHtcblx0ICAgIHZhbHVlOiBcInVwZGF0ZVwiLFxuXHQgICAgZGVzY3JpcHRpb246IFwiVGhpcyBldmVudCBtZWFucyBhIFBhcnNlT2JqZWN0J3Mgb2xkIHZhbHVlIGFuZCBpdHMgbmV3IHZhbHVlIGZ1bGZpbGwgdGhlIFBhcnNlUXVlcnkgYXQgdGhlIHNhbWUgdGltZVwiXG5cdCAgfSxcblx0ICBsZWF2ZToge1xuXHQgICAgdmFsdWU6IFwibGVhdmVcIixcblx0ICAgIGRlc2NyaXB0aW9uOiBcIlRoaXMgZXZlbnQgbWVhbnMgYSBQYXJzZU9iamVjdCdzIG9sZCB2YWx1ZSBmdWxmaWxscyB0aGUgUGFyc2VRdWVyeSBidXQgaXRzIG5ldyB2YWx1ZSBkb2VzIG5vdFwiXG5cdCAgfSxcblx0ICBkZWxldGU6IHtcblx0ICAgIHZhbHVlOiBcImRlbGV0ZVwiLFxuXHQgICAgZGVzY3JpcHRpb246IFwiVGhpcyBldmVudCBtZWFucyBhIFBhcnNlT2JqZWN0J3Mgd2hvc2UgdmFsdWUgZnVsZmlsbHMgdGhlIFBhcnNlUXVlcnkgaXMgZGVsZXRlZFwiXG5cdCAgfVxuXHR9XG59KSJdfQ==