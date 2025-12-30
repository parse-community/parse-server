CREATE OR REPLACE FUNCTION array_contains(
  "array"   JSON,
  "values"  JSON
)
RETURN NUMBER
DETERMINISTIC
IS
  cnt NUMBER := 0;
BEGIN
  SELECT COUNT(*)
  INTO cnt
  FROM JSON_TABLE("array", '$[*]' COLUMNS (value JSON PATH '$')) arr
  WHERE EXISTS (
    SELECT 1
    FROM JSON_TABLE("values", '$[*]' COLUMNS (val JSON PATH '$')) vals
    WHERE arr.value = vals.val
  );
  RETURN CASE WHEN cnt >= 1 THEN 1 ELSE 0 END;
END;
/

