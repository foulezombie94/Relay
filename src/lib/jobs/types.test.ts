import { describe, it, expect } from "vitest";
import { backoff } from "./types";
describe("job backoff",()=>{
  it("increases delays and adds bounded jitter",()=>{
    expect(backoff(1,0)).toBe(15);expect(backoff(2,0)).toBe(30);
    expect(backoff(3,0.5)).toBe(67);expect(backoff(100,0)).toBe(3600);
  });
});
