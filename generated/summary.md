
# 🛫 Detail Results

Detail has tested your pull request with historical traffic and identified the following behavior changes:


| Route | Method | Requests | Affected Requests | Changes
| ----- | ------ | -------- | ----------------- | -------
| `/parse/classes/:className` | POST | 1 | 1 | [Diffs](#user-content-post--parse-classes--classname) |
| **Total** |        | **1** | **1** |




## Changes 

<details><summary>POST /parse/classes/:className <a href="#user-content-post--parse-classes--classname" id="post--parse-classes--classname">#</a></summary>



### Requests:

 - Request [0fa211af61fefed3d082317d00f48963](#user-content-0fa211af61fefed3d082317d00f48963)


  

### Request `0fa211af61fefed3d082317d00f48963` <a href="#user-content-0fa211af61fefed3d082317d00f48963" id="0fa211af61fefed3d082317d00f48963">#</a>

URL: `/parse/classes/GameScore`


<table>
  <tr>
    <th>Library</th>
    <th>Calls</th>
  </tr>

  <tr>
    <td><pre>pg</pre></td>
    <td>

Old: previous code made this pg call. ⬇️

```diff
-  library: "pg"
-  query: "INSERT INTO \"GameScore\" (\"score\",\"playerName\",\"cheatMode\",\"updatedAt\",\"createdAt\",\"objectId\") VALUES (1337,'Sean Plott',false,'2024-06-06T23:32:36.602Z','2024-06-06T23:32:36.602Z','3W67SXxfyI')"
-  params: [
-  ]
```

</td>
  </tr>
  <tr>
    <td>Response</td>
    <td>

```diff
-  status: 201                                                                           
+  status: 400
-  body: "{\"objectId\":\"3W67SXxfyI\",\"createdAt\":\"2024-06-06T23:32:36.602Z\"}"
+  body: "{\"code\":137,\"error\":\"A duplicate value for a field with unique values was provided\"}"
   header: {
-    location: "http://localhost:1337/parse/classes/GameScore/3W67SXxfyI"
     x-powered-by: "Express"
     access-control-allow-methods: "GET,PUT,POST,DELETE,OPTIONS"
     access-control-allow-headers: "X-Parse-Master-Key, X-Parse-REST-API-Key, X-Parse-Javascript-Key, X-Parse-Application-Id, X-Parse-Client-Version, X-Parse-Session-Token, X-Requested-With, X-Parse-Revocable-Session, X-Parse-Request-Id, Content-Type, Pragma, Cache-Control"
     access-control-expose-headers: "X-Parse-Job-Status-Id, X-Parse-Push-Status-Id"
     content-type: "application/json; charset=utf-8"
   }
```

</td>
  </tr></table>



</details>

