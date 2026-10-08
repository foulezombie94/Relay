import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));
const mocks=vi.hoisted(() => ({rpc:vi.fn()}));
vi.mock("@/lib/agent/tools", () => ({rpc:mocks.rpc}));
vi.mock("./context",()=>({ApiError:class extends Error {constructor(message:string, public status=400){super(message);}},databaseError:vi.fn()}));
import { dashboardResults, dashboardDetails } from "./dashboards";
import { ApiError } from "./context";
import { dashboardTemplate, defaultTile } from "@/lib/domain/dashboards";
const client={} as SupabaseClient;
const result={data:[],totals:[],total:0,partial:false,missing_history:0,coverage:"Exact"};
beforeEach(()=>{ mocks.rpc.mockReset().mockResolvedValue(result); });
describe("dashboard backend boundaries",()=>{
 it("binds every calculation to the current workspace and limits concurrency",async()=>{let active=0,max=0;mocks.rpc.mockImplementation(async()=>{active++;max=Math.max(max,active);await Promise.resolve();active--;return result;});const r=await dashboardResults(client,"current-workspace",dashboardTemplate("sales"));expect(r.tiles).toHaveLength(8);expect(max).toBeLessThanOrEqual(3);expect(mocks.rpc).toHaveBeenCalledTimes(8);for(const call of mocks.rpc.mock.calls)expect(call[2].w).toBe("current-workspace");});
 it("never substitutes a previous result after permission revocation",async()=>{mocks.rpc.mockRejectedValue(new ApiError("Revoked",403));await expect(dashboardResults(client,"w",dashboardTemplate("sales"))).rejects.toMatchObject({status:403});});
 it("reports a failed calculation without claiming a successful value",async()=>{mocks.rpc.mockRejectedValue(new ApiError("Timeout",408));const r=await dashboardResults(client,"w",{...dashboardTemplate("sales"),config:[defaultTile()]});expect(r.tiles[0].error).toBe("Timeout");expect(r.tiles[0].current).toBeUndefined();});
 it("rejects a detail index outside the saved configuration",async()=>{await expect(dashboardDetails(client,"w",dashboardTemplate("sales"),dashboardTemplate("sales").settings,23,null,null,null)).rejects.toMatchObject({status:404});expect(mocks.rpc).not.toHaveBeenCalled();});
});

