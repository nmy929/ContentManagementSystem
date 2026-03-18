README - Load CSV data into PostgreSQL
1. Put all CSV files and schema_and_load_all.sql in one directory accessible by psql client.
2. From a shell with psql: psql -U nmy -d mydb -f schema_and_load_all.sql
   This will create tables and run the \copy commands to load CSVs.
3. If using Docker, mount the directory into the container and run psql inside the container to execute the script.
4. After loading, run ANALYZE and then run the EXPLAIN/pg_stat queries for experiments.