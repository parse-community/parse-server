# mongoUrl

A fork of node's `url` module, with the modification that commas and colons are 
allowed in hostnames. While this results in a slightly incorrect parsed result, 
as the hostname field for a mongodb should be an array of replica sets, it's 
good enough to let us pull out and escape the auth portion of the URL.

https://github.com/parse-community/parse-server/pull/986
