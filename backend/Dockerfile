FROM python:3.11-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /backend
COPY requirements.txt /backend/requirements.txt
RUN pip install --no-cache-dir -r /backend/requirements.txt

COPY app /backend/app
COPY init_experiment_table.sql /backend/init_experiment_table.sql

ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
