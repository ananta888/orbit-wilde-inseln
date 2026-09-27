"""Bounded, killable geometry jobs. Only validated results can leave a worker."""
import asyncio
import multiprocessing

from .document import DesignError, validate
from .geometry import apply


def perform(doc, operations):
    candidate = doc
    for operation in operations: candidate = apply(candidate, operation)
    return candidate


def _job(pipe, runner, doc, operations):
    try:
        result = runner(doc, operations)
        validate(result)
        pipe.send((True, result))
    except DesignError as error:
        pipe.send((False, str(error)))
    except Exception:
        pipe.send((False, "Geometrieauftrag fehlgeschlagen; Original bleibt erhalten"))
    finally:
        pipe.close()


class GeometryWorkers:
    def __init__(self, *, timeout=15., concurrency=2, runner=perform):
        self.timeout, self.concurrency, self.runner = timeout, concurrency, runner
        self.context = multiprocessing.get_context("spawn")
        self.jobs = set()
        self.closed = False

    async def run(self, doc, operations):
        if self.closed or len(self.jobs) >= self.concurrency:
            raise DesignError("Geometrieberechnung ausgelastet oder beendet")
        task = asyncio.current_task()
        self.jobs.add(task)
        read, write = self.context.Pipe(duplex=False)
        process = self.context.Process(target=_job, args=(write, self.runner, doc, operations), daemon=True)
        try:
            process.start()
            write.close()
            # A killed writer releases recv with EOF. Native work never blocks the event loop.
            receive = asyncio.create_task(asyncio.to_thread(read.recv))
            try:
                ok, result = await asyncio.wait_for(asyncio.shield(receive), self.timeout)
                if not ok: raise DesignError(result)
                return result
            except TimeoutError as error:
                raise DesignError("Geometrieauftrag abgebrochen: Zeitbudget überschritten") from error
            except (EOFError, OSError) as error:
                raise DesignError("Geometrieprozess beendet; Original bleibt erhalten") from error
            finally:
                if process.is_alive(): process.terminate()
                await asyncio.to_thread(process.join, 1.)
                if process.is_alive():
                    process.kill()
                    await asyncio.to_thread(process.join, 1.)
                await asyncio.gather(receive, return_exceptions=True)
        finally:
            read.close(); write.close()
            if process.pid is not None and not process.is_alive(): process.close()
            self.jobs.discard(task)

    async def close(self):
        self.closed = True
        jobs = tuple(self.jobs)
        for job in jobs: job.cancel()
        await asyncio.gather(*jobs, return_exceptions=True)
