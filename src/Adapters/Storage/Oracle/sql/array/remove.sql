CREATE OR REPLACE FUNCTION array_remove(
  "array"   JSON,
  "values"  JSON
)
RETURN JSON
DETERMINISTIC
IS
  result JSON;
BEGIN
  SELECT JSON_ARRAYAGG(value)
  INTO result
  FROM (
    SELECT value
    FROM JSON_TABLE("array", '$[*]' COLUMNS (value JSON PATH '$')) arr
    WHERE NOT EXISTS (
      SELECT 1
      FROM JSON_TABLE("values", '$[*]' COLUMNS (val JSON PATH '$')) vals
      WHERE arr.value = vals.val
    )
  );
  RETURN COALESCE(result, JSON_ARRAY());
END;
/

