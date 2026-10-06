import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
import { flushLogging, logEvent } from "./logger";
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.restoreAllMocks();});
it("bounds remote logging and never delays a worker job on ingestion",async()=>{
  vi.stubEnv("RELAY_SERVICE","relay-worker");vi.stubEnv("BETTER_STACK_SOURCE_TOKEN","test");vi.stubEnv("BETTER_STACK_INGEST_URL","https://logs.example.invalid");
  vi.spyOn(console,"log").mockImplementation(()=>{});vi.spyOn(console,"warn").mockImplementation(()=>{});
  let finish!:()=>void;const waiting=new Promise<Response>(resolve=>{finish=()=>resolve(new Response());});
  const fetchMock=vi.fn(()=>waiting);vi.stubGlobal("fetch",fetchMock);
  for(let n=0;n<20;n++) await logEvent("info","job_started",{attempt:n});
  expect(fetchMock).toHaveBeenCalledTimes(8);finish();await flushLogging();
  expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('"count":12'));
});
