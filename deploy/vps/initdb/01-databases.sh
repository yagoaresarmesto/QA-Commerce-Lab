#!/bin/sh
# Runs once, on the first start of the PostgreSQL volume.
# One database and one role per environment: the demo can never read or wipe testing data (and vice versa).
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<SQL
CREATE ROLE qacl_demo LOGIN PASSWORD '${DEMO_DB_PASSWORD}';
CREATE ROLE qacl_testing LOGIN PASSWORD '${TESTING_DB_PASSWORD}';
CREATE DATABASE qacl_demo OWNER qacl_demo;
CREATE DATABASE qacl_testing OWNER qacl_testing;
REVOKE ALL ON DATABASE qacl_demo FROM PUBLIC;
REVOKE ALL ON DATABASE qacl_testing FROM PUBLIC;
SQL
