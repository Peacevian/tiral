import type { GeoBounds, LatLng } from "./geo.js"

export type Zone = {
  id: string
  name: string
  bounds: GeoBounds
  startPoints: StartPoint[]
  bountyLocations: BountyLocation[]
}

export type StartPoint = {
  id: string
  name: string
  position: LatLng
}

export type BountyLocation = {
  id: string
  name: string
  position: LatLng
}

export const KAMPALA_ZONE: Zone = {
  id: "kampala-central",
  name: "Kampala Central",
  bounds: {
    north: 0.325,
    south: 0.305,
    east: 32.595,
    west: 32.565
  },
  startPoints: [
    { id: "start-kampala-road", name: "Kampala Road", position: { lat: 0.3136, lng: 32.5811 } },
    { id: "start-nakasero", name: "Nakasero", position: { lat: 0.3202, lng: 32.5845 } },
    { id: "start-nasser-road", name: "Nasser Road", position: { lat: 0.3178, lng: 32.5792 } },
    { id: "start-jinja-road", name: "Jinja Road", position: { lat: 0.3116, lng: 32.5852 } },
    { id: "start-parliament", name: "Parliament", position: { lat: 0.3212, lng: 32.5878 } }
  ],
  bountyLocations: [
    { id: "bounty-city-square", name: "City Square", position: { lat: 0.3134, lng: 32.5808 } },
    { id: "bounty-nakasero-market", name: "Nakasero Market", position: { lat: 0.3186, lng: 32.5766 } },
    { id: "bounty-sheraton", name: "Sheraton Hill", position: { lat: 0.3184, lng: 32.5863 } },
    { id: "bounty-old-taxi-park", name: "Old Taxi Park", position: { lat: 0.3131, lng: 32.5739 } },
    { id: "bounty-nakivubo", name: "Nakivubo", position: { lat: 0.3098, lng: 32.5794 } }
  ]
}
