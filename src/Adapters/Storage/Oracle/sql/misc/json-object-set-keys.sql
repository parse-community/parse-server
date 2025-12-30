-- Function to set a key on a nested JSON document
-- Oracle 23ai has native JSON support, so we can use JSON_MERGEPATCH

CREATE OR REPLACE FUNCTION json_object_set_key(
  "json"        JSON,
  key_to_set    VARCHAR2,
  value_to_set  JSON
)
RETURN JSON
DETERMINISTIC
IS
  result JSON;
  key_value JSON;
BEGIN
  -- Create a JSON object with the new key-value pair
  key_value := JSON_OBJECT(key_to_set VALUE value_to_set);
  
  -- Merge with existing JSON, which will replace the key if it exists
  result := JSON_MERGEPATCH("json", key_value);
  
  RETURN result;
END;
/

