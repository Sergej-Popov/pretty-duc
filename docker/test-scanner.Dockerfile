FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends duc ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /work
COPY docker/scan-fixture.sh /usr/local/bin/scan-fixture.sh
RUN chmod +x /usr/local/bin/scan-fixture.sh
CMD ["/usr/local/bin/scan-fixture.sh"]
