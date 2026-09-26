import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { hint, housingStore, newListingId, newPhotoRef, ownerKey, photoBelongsTo, resetHousingStore } from "./store";
import { PHOTO_REF } from "./listing";

const SECRET = "test-secret";

describe("owner keys", () => {
  test("stable per address, case-insensitive, and not the address", () => {
    const a = ownerKey("Alex@UCSD.edu", SECRET);
    assert.equal(a, ownerKey(" alex@ucsd.edu ", SECRET));
    assert.match(a, /^own:[0-9a-f]{40}$/);
    assert.ok(!a.includes("alex"));
  });

  test("differ by secret, so they cannot be precomputed from a list of addresses", () => {
    assert.notEqual(ownerKey("alex@ucsd.edu", SECRET), ownerKey("alex@ucsd.edu", "other"));
  });

  test("differ from the Academic History key for the same student", () => {
    assert.ok(!ownerKey("alex@ucsd.edu", SECRET).startsWith("hist:"));
  });
});

describe("photo refs", () => {
  const alex = ownerKey("alex@ucsd.edu", SECRET);
  const sam = ownerKey("sam@ucsd.edu", SECRET);

  test("a ref proves who uploaded it", () => {
    const ref = newPhotoRef(alex, SECRET);
    assert.match(ref, PHOTO_REF);
    assert.ok(photoBelongsTo(ref, alex, SECRET));
    assert.ok(!photoBelongsTo(ref, sam, SECRET));
  });

  test("a forged or altered ref proves nothing", () => {
    const ref = newPhotoRef(alex, SECRET);
    const flipped = ref.slice(0, -1) + (ref.endsWith("A") ? "B" : "A");
    assert.ok(!photoBelongsTo(flipped, alex, SECRET));
    assert.ok(!photoBelongsTo("../../etc/passwd", alex, SECRET));
    assert.ok(!photoBelongsTo(ref, alex, "another-secret"));
  });

  test("every ref and listing id is fresh", () => {
    const refs = new Set(Array.from({ length: 50 }, () => newPhotoRef(alex, SECRET)));
    const ids = new Set(Array.from({ length: 50 }, newListingId));
    assert.equal(refs.size, 50);
    assert.equal(ids.size, 50);
  });
});

describe("hint", () => {
  test("a missing table or bucket points at the migration", () => {
    assert.match(hint(404, '{"code":"PGRST205"}'), /002_housing\.sql/);
    assert.match(hint(400, '{"error":"Bucket not found"}'), /002_housing\.sql/);
  });

  test("a rejected key asks for the service role", () => {
    assert.match(hint(401, "JWT expired"), /SERVICE ROLE/);
    assert.equal(hint(500, "boom"), "");
  });
});

describe("the Supabase driver, against a stand-in for its REST API", () => {
  const realFetch = globalThis.fetch;
  const saved = { ...process.env };
  let calls: { url: string; init: RequestInit }[] = [];
  let reply: (url: string) => Response;

  const listing = {
    id: "abc12345", owner: "own:x", kind: "sublet", rent: 900, utilities: null, address: "3990 Nobel Dr, San Diego, CA 92122",
    area: "University City", ll: [32.868, -117.22], from: "2027-01-01", to: "2027-03-31", room: "private", bath: "shared",
    bedrooms: null, housemates: null, furnished: false, laundry: "none", parking: false, pets: false, title: "", about: "",
    contact: { email: null, phone: null, other: "IG @x" }, poster: "A B.", photos: [], created: "2026-09-26T00:00:00Z",
    confirmed: "2026-09-26T00:00:00Z", status: "open", reports: [], v: 1,
  } as const;

  const withStore = async <T,>(fn: (s: NonNullable<ReturnType<typeof housingStore>>) => Promise<T>): Promise<T> => {
    process.env.SUPABASE_URL = "https://proj.supabase.test/";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    resetHousingStore();
    calls = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
      calls.push({ url: String(input), init });
      return reply(String(input));
    }) as typeof fetch;
    try {
      const store = housingStore();
      assert.equal(store?.name, "supabase");
      return await fn(store!);
    } finally {
      globalThis.fetch = realFetch;
      process.env = { ...saved };
      resetHousingStore();
    }
  };

  test("reads every listing with the service key, newest first", async () => {
    reply = () => Response.json([{ record: listing }, { record: { junk: true } }]);
    const all = await withStore((s) => s.all());
    assert.equal(all.length, 1, "a malformed row is skipped, not trusted");
    assert.equal(calls[0].url, "https://proj.supabase.test/rest/v1/housing_listing?select=record&order=updated_at.desc&limit=2000");
    const h = calls[0].init.headers as Record<string, string>;
    assert.equal(h.apikey, "service-key");
    assert.equal(h.authorization, "Bearer service-key");
  });

  test("writes as an upsert on the id", async () => {
    reply = () => new Response(null, { status: 201 });
    await withStore((s) => s.put(listing as never));
    assert.equal(calls[0].init.method, "POST");
    assert.match((calls[0].init.headers as Record<string, string>).prefer, /resolution=merge-duplicates/);
    const [row] = JSON.parse(String(calls[0].init.body));
    assert.equal(row.id, "abc12345");
    assert.equal(row.owner, "own:x");
    assert.equal(row.record.rent, 900);
  });

  test("photos go to the private bucket as JPEG, and a missing one is null", async () => {
    reply = (url) => (url.includes("/authenticated/") ? new Response("not found", { status: 400 }) : Response.json({ Key: "x" }));
    const got = await withStore(async (s) => {
      await s.putPhoto("r".repeat(32), new Uint8Array([0xff, 0xd8, 0xff]));
      return s.getPhoto("r".repeat(32));
    });
    assert.equal(calls[0].url, `https://proj.supabase.test/storage/v1/object/housing-photos/${"r".repeat(32)}.jpg`);
    assert.equal((calls[0].init.headers as Record<string, string>)["content-type"], "image/jpeg");
    assert.equal(calls[1].url, `https://proj.supabase.test/storage/v1/object/authenticated/housing-photos/${"r".repeat(32)}.jpg`);
    assert.equal(got, null);
  });

  test("a database without the migration says which file to run", async () => {
    reply = () => new Response('{"code":"PGRST205","message":"Could not find the table"}', { status: 404 });
    await assert.rejects(withStore((s) => s.all()), /002_housing\.sql/);
  });
});
