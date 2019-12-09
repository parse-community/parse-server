"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FileInput = exports.File = void 0;

var _graphql = require("graphql");

const File = new _graphql.GraphQLObjectType({
  name: 'File',
  fields: {
    name: {
      type: _graphql.GraphQLString,
      name: 'name',
      description: 'name of the file'
    },
    url: {
      type: _graphql.GraphQLString,
      name: 'url',
      description: 'url of the file'
    }
  }
});
exports.File = File;
const FileInput = new _graphql.GraphQLInputObjectType({
  name: 'FileInput',
  fields: {
    name: {
      type: _graphql.GraphQLString,
      description: 'name of the file'
    },
    base64: {
      type: _graphql.GraphQLString,
      description: 'the base 64 encoded contents of the file'
    },
    contentType: {
      type: _graphql.GraphQLString,
      description: 'the content type of the file. Optional'
    }
  }
});
exports.FileInput = FileInput;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9ncmFwaHFsL3R5cGVzL0ZpbGUuanMiXSwibmFtZXMiOlsiRmlsZSIsIkdyYXBoUUxPYmplY3RUeXBlIiwibmFtZSIsImZpZWxkcyIsInR5cGUiLCJHcmFwaFFMU3RyaW5nIiwiZGVzY3JpcHRpb24iLCJ1cmwiLCJGaWxlSW5wdXQiLCJHcmFwaFFMSW5wdXRPYmplY3RUeXBlIiwiYmFzZTY0IiwiY29udGVudFR5cGUiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFNTyxNQUFNQSxJQUFJLEdBQUcsSUFBSUMsMEJBQUosQ0FBc0I7QUFDeENDLEVBQUFBLElBQUksRUFBRSxNQURrQztBQUV4Q0MsRUFBQUEsTUFBTSxFQUFFO0FBQ05ELElBQUFBLElBQUksRUFBRTtBQUNKRSxNQUFBQSxJQUFJLEVBQUVDLHNCQURGO0FBRUpILE1BQUFBLElBQUksRUFBRSxNQUZGO0FBR0pJLE1BQUFBLFdBQVcsRUFBRTtBQUhULEtBREE7QUFNTkMsSUFBQUEsR0FBRyxFQUFFO0FBQ0hILE1BQUFBLElBQUksRUFBRUMsc0JBREg7QUFFSEgsTUFBQUEsSUFBSSxFQUFFLEtBRkg7QUFHSEksTUFBQUEsV0FBVyxFQUFFO0FBSFY7QUFOQztBQUZnQyxDQUF0QixDQUFiOztBQWdCQSxNQUFNRSxTQUFTLEdBQUcsSUFBSUMsK0JBQUosQ0FBMkI7QUFDbERQLEVBQUFBLElBQUksRUFBRSxXQUQ0QztBQUVsREMsRUFBQUEsTUFBTSxFQUFFO0FBQ05ELElBQUFBLElBQUksRUFBRTtBQUNKRSxNQUFBQSxJQUFJLEVBQUVDLHNCQURGO0FBRUpDLE1BQUFBLFdBQVcsRUFBRTtBQUZULEtBREE7QUFLTkksSUFBQUEsTUFBTSxFQUFFO0FBQ05OLE1BQUFBLElBQUksRUFBRUMsc0JBREE7QUFFTkMsTUFBQUEsV0FBVyxFQUFFO0FBRlAsS0FMRjtBQVNOSyxJQUFBQSxXQUFXLEVBQUU7QUFDWFAsTUFBQUEsSUFBSSxFQUFFQyxzQkFESztBQUVYQyxNQUFBQSxXQUFXLEVBQUU7QUFGRjtBQVRQO0FBRjBDLENBQTNCLENBQWxCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgR3JhcGhRTE9iamVjdFR5cGUsXG4gIEdyYXBoUUxJbnB1dE9iamVjdFR5cGUsXG4gIEdyYXBoUUxTdHJpbmcsXG59IGZyb20gJ2dyYXBocWwnO1xuXG5leHBvcnQgY29uc3QgRmlsZSA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdGaWxlJyxcbiAgZmllbGRzOiB7XG4gICAgbmFtZToge1xuICAgICAgdHlwZTogR3JhcGhRTFN0cmluZyxcbiAgICAgIG5hbWU6ICduYW1lJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnbmFtZSBvZiB0aGUgZmlsZScsXG4gICAgfSxcbiAgICB1cmw6IHtcbiAgICAgIHR5cGU6IEdyYXBoUUxTdHJpbmcsXG4gICAgICBuYW1lOiAndXJsJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAndXJsIG9mIHRoZSBmaWxlJyxcbiAgICB9LFxuICB9LFxufSk7XG5cbmV4cG9ydCBjb25zdCBGaWxlSW5wdXQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdGaWxlSW5wdXQnLFxuICBmaWVsZHM6IHtcbiAgICBuYW1lOiB7XG4gICAgICB0eXBlOiBHcmFwaFFMU3RyaW5nLFxuICAgICAgZGVzY3JpcHRpb246ICduYW1lIG9mIHRoZSBmaWxlJyxcbiAgICB9LFxuICAgIGJhc2U2NDoge1xuICAgICAgdHlwZTogR3JhcGhRTFN0cmluZyxcbiAgICAgIGRlc2NyaXB0aW9uOiAndGhlIGJhc2UgNjQgZW5jb2RlZCBjb250ZW50cyBvZiB0aGUgZmlsZScsXG4gICAgfSxcbiAgICBjb250ZW50VHlwZToge1xuICAgICAgdHlwZTogR3JhcGhRTFN0cmluZyxcbiAgICAgIGRlc2NyaXB0aW9uOiAndGhlIGNvbnRlbnQgdHlwZSBvZiB0aGUgZmlsZS4gT3B0aW9uYWwnLFxuICAgIH0sXG4gIH0sXG59KTtcbiJdfQ==