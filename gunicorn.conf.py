# Gunicorn picks this file up automatically when started from the project root.
# Handlers mostly wait on the network (Cloudinary, MySQL, external APIs), so threads
# let one slow request (e.g. an upload) run without blocking pins and pages for everyone.
import os

worker_class = "gthread"
# One worker keeps the in-memory rate limiter accurate (each worker counts separately).
workers = int(os.getenv("WEB_CONCURRENCY", 1))
threads = int(os.getenv("GUNICORN_THREADS", 8))
timeout = 60
