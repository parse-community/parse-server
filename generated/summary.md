
# 🛫 Detail Results

Detail has tested your pull request with historical traffic and identified the following behavior changes:


| Route | Method | Requests | Affected Requests | Changes
| ----- | ------ | -------- | ----------------- | -------
| `/parse/classes/:className` | POST | 1 | 1 | [Diffs](#user-content-post--parse-classes--classname) |
| **Total** |        | **1** | **1** |



🚨 The following tests were not run: __mocks__

This can hide behavior changes.


## Changes 

<details><summary>POST /parse/classes/:className <a href="#user-content-post--parse-classes--classname" id="post--parse-classes--classname">#</a></summary>



### Requests:

 - Request [c04b241fc667089b774d38e2117f4940](#user-content-c04b241fc667089b774d38e2117f4940)


  

### Request `c04b241fc667089b774d38e2117f4940` <a href="#user-content-c04b241fc667089b774d38e2117f4940" id="c04b241fc667089b774d38e2117f4940">#</a>

URL: `/parse/classes/GameScore`


<table>
  <tr>
    <th>Library</th>
    <th>Calls</th>
  </tr>

  <tr>
    <td><pre>pg</pre></td>
    <td>

```diff
   library: "pg"
   query: "INSERT INTO \"GameScore\" (\"score\",\"playerName\",\"cheatMode\",\"updatedAt\",\"createdAt\",\"objectId\") VALUES (1337,'Sean Plott',false,'2024-06-07T18:57:26.461Z','2024-06-07T18:57:26.461Z','EBxZDyd4Ln')"
   params: [
   ]
```

</td>
  </tr>
  <tr>
    <td><pre>pg</pre></td>
    <td>

New: the code in this PR makes these pg calls. ⬇️

```diff
+  library: "pg"
+  connectionString: "*"
```


```diff
+  library: "pg"
+  connectionString: "*"
```


```diff
+  library: "pg"
+  connectionString: "*"
```


```diff
+  library: "pg"
+  connectionString: "*"
```


```diff
+  library: "pg"
+  connectionString: "*"
```


```diff
+  library: "pg"
+  connectionString: "*"
```


```diff
+  library: "pg"
+  connectionString: "*"
```


```diff
+  library: "pg"
+  connectionString: "*"
```


```diff
+  library: "pg"
+  connectionString: "*"
```


```diff
+  library: "pg"
+  connectionString: "*"
```


```diff
+  library: "pg"
+  connectionString: "*"
```


```diff
+  library: "pg"
+  connectionString: "*"
```


```diff
+  library: "pg"
+  connectionString: "*"
```


```diff
+  library: "pg"
+  connectionString: "*"
```


```diff
+  library: "pg"
+  connectionString: "*"
```


```diff
+  library: "pg"
+  connectionString: "*"
```


```diff
+  library: "pg"
+  connectionString: "*"
```


```diff
+  library: "pg"
+  connectionString: "*"
```


```diff
+  library: "pg"
+  connectionString: "*"
```


```diff
+  library: "pg"
+  connectionString: "*"
```


```diff
+  library: "pg"
+  connectionString: "*"
```


```diff
+  library: "pg"
+  connectionString: "*"
```


```diff
+  library: "pg"
+  connectionString: "*"
```


```diff
+  library: "pg"
+  connectionString: "*"
```


```diff
+  library: "pg"
+  connectionString: "*"
```


```diff
+  library: "pg"
+  connectionString: "*"
```


```diff
+  library: "pg"
+  connectionString: "*"
```


```diff
+  library: "pg"
+  connectionString: "*"
```


```diff
+  library: "pg"
+  connectionString: "*"
```

</td>
  </tr>
  <tr>
    <td>Response</td>
    <td>

```diff
   status: 201                                                                           
   body: "{\"objectId\":\"EBxZDyd4Ln\",\"createdAt\":\"2024-06-07T18:57:26.461Z\"}"
   header: {
     x-powered-by: "Express"
     access-control-allow-methods: "GET,PUT,POST,DELETE,OPTIONS"
     access-control-allow-headers: "X-Parse-Master-Key, X-Parse-REST-API-Key, X-Parse-Javascript-Key, X-Parse-Application-Id, X-Parse-Client-Version, X-Parse-Session-Token, X-Requested-With, X-Parse-Revocable-Session, X-Parse-Request-Id, Content-Type, Pragma, Cache-Control"
     access-control-expose-headers: "X-Parse-Job-Status-Id, X-Parse-Push-Status-Id"
     location: "http://localhost:1337/parse/classes/GameScore/EBxZDyd4Ln"
     content-type: "application/json; charset=utf-8"
   }
```

</td>
  </tr></table>



</details>

