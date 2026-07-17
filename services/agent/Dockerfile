FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /srv/agent

COPY pyproject.toml README.md ./
COPY app ./app
RUN pip install --no-cache-dir .

RUN addgroup --system micromanus \
    && adduser --system --ingroup micromanus micromanus \
    && mkdir -p /data/artifacts \
    && chown -R micromanus:micromanus /data

USER micromanus
EXPOSE 8000

ENV MICROMANUS_AGENT_CHECKPOINT_DB_PATH=/data/checkpoints.sqlite \
    MICROMANUS_AGENT_ARTIFACT_DIR=/data/artifacts

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
