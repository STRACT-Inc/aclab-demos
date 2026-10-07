# NLWeb server image for the ACLAB demo.
# The reference implementation has no tags or releases, so it is pinned by commit.
FROM python:3.12-slim

ARG NLWEB_SHA=b423f15d9aeaa023ce75993ac9deed2354597043
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN curl -fsSL "https://github.com/nlweb-ai/NLWeb/archive/${NLWEB_SHA}.tar.gz" | tar -xz --strip-components=1 \
 && echo "${NLWEB_SHA}" > /app/NLWEB_SHA

COPY requirements.lock /app/requirements.lock
RUN pip install -r /app/requirements.lock

# Overrides replace upstream files 1:1 (README.md lists each file and the reason).
COPY overrides/ /app/
COPY config/ /app/config/
COPY data/ /app/data-aclab/
COPY startup.sh /app/startup.sh
RUN chmod +x /app/startup.sh && mkdir -p /data/db

ENV PORT=8000
EXPOSE 8000
WORKDIR /app/AskAgent/python
CMD ["/app/startup.sh"]
