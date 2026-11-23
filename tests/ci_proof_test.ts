// Huriye Kayadelen, 2200005795
Deno.test("CI failure demonstration", () => {
  throw new Error("intentional red run");
});
