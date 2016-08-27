CREATE TABLE _SCHEMA(
    className varChar(120),
    schema jsonb,
    isParseClass bool,
    PRIMARY KEY (className)
);