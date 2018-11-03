const _ = require("underscore")
const turf = require("turf")

const provCentroids = require('./provCentroids')
const oProvs = require('./oldPositions')
// const nProvs = require('./newPositions')
const iProvs = require('./imperiumPositions')
const iCentroids = require('../eu4Migration/iProvLocsCoords').provCoords

const newToOldMapping = {}
const oKeys = Object.keys(oProvs)
// const nKeys = Object.keys(nProvs)
const iKeys = Object.keys(iProvs)

const addedKeys = _.difference(iKeys, oKeys)
const removedKeys =  _.difference(oKeys, iKeys)

const intersectKeys = _.intersection(iKeys,oKeys)

const addedPlus = {}
const oldPlus = []
let completedYear = {}

// provinces.forEach(prov => {
//
//   var polygon = turf.polygon(prov.geometry.coordinates);
//   var centroid = turf.centroid(polygon);
//
//   provCentroids[prov.properties.name] = centroid.geometry.coordinates
// })
//
// console.debug(JSON.stringify(provCentroids))
//
// console.debug(JSON.stringify(addedKeys))
// addedKeys.forEach(prov => {
//
// })
//
//
// oKeys.forEach(prov => {
//   const position = oProvs[prov].position
//
//   let sumX = 0, sumY = 0, n = position.length/2
//
//   for (var i = 0; i < position.length; i++ ) {
//     if (i%2 === 0) {
//       //x
//       sumX += position[i]
//     } else {
//       //y
//       sumY += position[i]
//     }
//   }
//   oldPlus.push([prov,+sumX/n,+sumY/n])
// })

// addedKeys.forEach(prov => {
//   const position = provCentroids[prov]
//
//   let sumX = 0, sumY = 0, n = position.length/2
//
//   for (var i = 0; i < position.length; i++ ) {
//     if (i%2 === 0) {
//       //x
//       sumX += position[i]
//     } else {
//       //y
//       sumY += position[i]
//     }
//   }
//   addedPlus[prov] = [+sumX/n, +sumY/n]
// })

// console.debug(addedKeys)
addedKeys.forEach(addedProv => {
  const position = iCentroids[addedProv] // TODO: this should be lat long from new file

  if (position) {
    currX = +position[0]
    currY = +position[1]

    let closestDelta = Infinity, nearestProv = false
    let newDeltaX
    let newDeltaY
    Object.keys(provCentroids).forEach(oldProvObj => {
      // console.debug("1comparing",oldProvObj,provCentroids[oldProvObj][0], provCentroids[oldProvObj][1])
      // console.debug("2comparing", addedProv, currY, currX)
      newDeltaX = Math.abs(provCentroids[oldProvObj][0] - currY)
      newDeltaY = Math.abs(provCentroids[oldProvObj][1] - currX)

      // console.debug(oldProvObj, provCentroids[oldProvObj], currX, newDeltaY,newDeltaX)

      if (closestDelta > (newDeltaX + newDeltaY)) {
        closestDelta = (newDeltaX + newDeltaY)
        nearestProv = oldProvObj
      }
    })

    if (nearestProv) {
      newToOldMapping[addedProv] = nearestProv
    }
  }
})


console.debug(JSON.stringify(newToOldMapping))

// console.debug(addedKeys.length)
// console.debug(removedKeys.length)
//
// console.debug(oldPlus)
