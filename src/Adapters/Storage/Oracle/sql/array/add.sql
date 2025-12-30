CREATE OR REPLACE FUNCTION array_add(
  "array"   JSON,
  "values"  JSON
)
RETURN JSON
DETERMINISTIC
IS
  result JSON;
BEGIN
  SELECT JSON_ARRAYAGG(value ORDER BY value)
  INTO result
  FROM (
    SELECT DISTINCT value
    FROM JSON_TABLE("array", '$[*]' COLUMNS (value JSON PATH '$'))
    UNION ALL
    SELECT value
    FROM JSON_TABLE("values", '$[*]' COLUMNS (value JSON PATH '$'))
  );
  RETURN COALESCE(result, JSON_ARRAY());
END;
/

