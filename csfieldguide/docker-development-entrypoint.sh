#!/bin/bash

function postgres_ready(){
/docker_venv/bin/python << END
import sys, psycopg2, os
try:
    conn = psycopg2.connect(dbname="kubernetes_django", user=os.getenv('POSTGRES_USER'), password=os.getenv('POSTGRES_PASSWORD'), host=os.getenv('POSTGRES_HOST'), port=os.getenv('POSTGRES_PORT', 5432))
except psycopg2.OperationalError:
    sys.exit(-1)
sys.exit(0)
END
}

until postgres_ready; do
  >&2 echo "Postgres is unavailable - sleeping"
  sleep 1
done

>&2 echo "Postgres is up - continuing..."

echo "Compiling message files"
/docker_venv/bin/python3 ./manage.py compilemessages

# Temporary migrations, content, and static collections
/docker_venv/bin/python3 ./manage.py migrate
/docker_venv/bin/python3 ./manage.py updatedata
/docker_venv/bin/python3 ./manage.py collectstatic --no-input --clear

# Start gunicorn service
echo "Starting gunicorn"
/docker_venv/bin/gunicorn -c ./gunicorn.conf.py -b :$PORT config.wsgi --reload
