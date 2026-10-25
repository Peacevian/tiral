// Downloads the game's Mixamo animations in one go. Mixamo has no public API:
// this uses the one its own website calls, with your login, from inside your
// browser (nothing leaves it). It may stop working if Adobe changes the site.
//
// 1. Log in at https://www.mixamo.com and open the Animations tab.
// 2. Open the console (Cmd+Option+J), paste this whole file, press Enter.
// 3. Allow "download multiple files" if Chrome asks.
// Each clip is saved as "<name>.fbx": FBX binary, without skin, 30 fps, no
// keyframe reduction; walking and running in place.
;(async () => {
  const CLIPS = [
    "Breathing Idle",
    "Walking",
    "Running",
    "Fast Run",
    "Jump",
    "Waving",
    "Sitting Idle",
    "Sitting Talking",
    "Talking",
    "Texting While Standing",
    "Sad Idle",
    "Defeated",
    "Victory",
    "Hip Hop Dancing",
    "Hit Reaction"
  ]
  const IN_PLACE = /walk|run/i
  const API = "https://www.mixamo.com/api/v1"
  const token = localStorage.access_token
  if (!token) throw new Error("Not logged in to Mixamo (no access token in this tab)")
  const headers = { Authorization: `Bearer ${token}`, "X-Api-Key": "mixamo2", "Content-Type": "application/json", Accept: "application/json" }
  const call = async (path, options = {}) => {
    const res = await fetch(`${API}${path}`, { headers, ...options })
    if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
    return res.json()
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))

  const character = (await call("/characters/primary")).primary_character_id
  console.log("Character:", character)

  for (const name of CLIPS) {
    try {
      const found = await call(`/products?page=1&limit=24&order=&type=Motion&query=${encodeURIComponent(name)}`)
      const product = found.results.find((r) => r.name.toLowerCase() === name.toLowerCase()) ?? found.results[0]
      if (!product) {
        console.warn("Not found:", name)
        continue
      }
      const details = (await call(`/products/${product.id}?similar=0&character_id=${character}`)).details
      const gms = details.gms_hash
      const params = gms.params.map(([param, value]) => (/in place/i.test(param) && IN_PLACE.test(name) ? 1 : value))
      await call("/animations/export", {
        method: "POST",
        body: JSON.stringify({
          character_id: character,
          gms_hash: [{ ...gms, params: params.join(","), overdrive: 0, trim: [Math.round(gms.trim[0]), Math.round(gms.trim[1])], "arm-space": gms["arm-space"] ?? 0, inplace: IN_PLACE.test(name) }],
          preferences: { format: "fbx7_2019", skin: "false", fps: "30", reducekf: "0" },
          product_name: product.name,
          type: "Motion"
        })
      })
      let job
      for (let i = 0; i < 60; i++) {
        await wait(2000)
        job = await call(`/characters/${character}/monitor`)
        if (job.status === "completed" || job.status === "failed") break
      }
      if (job?.status !== "completed") {
        console.warn("Export failed:", name, job)
        continue
      }
      // The page may not fetch from Mixamo's file storage, but a link to it
      // downloads (the file comes named by Mixamo, usually after the clip).
      const a = document.createElement("a")
      a.href = job.job_result
      a.download = `${name}.fbx`
      document.body.append(a)
      a.click()
      a.remove()
      console.log("Downloaded:", name, `(${product.name})`)
      await wait(3000)
    } catch (error) {
      console.warn("Failed:", name, error)
    }
  }
  console.log("All done")
})()
