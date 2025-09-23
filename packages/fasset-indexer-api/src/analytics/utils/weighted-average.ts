/**
 * This module provides a function to produce a time-sensitive statistic given some timeseries.
 * The returned statistic should be more sensitive to recent timestamps and should be a pseudo-average
 * of the given data point values.
 */

import { MAX_BIPS } from "../../config/constants"
import type { Timespan } from "../types"

export function weightedAverage(timespan: Timespan<bigint>, T: number, d: number): bigint {
  const fun = (t: bigint) => weightFun(Number(t), T, d)
  const weights = timespan.map(({ timestamp }) => BigInt(timestamp))
  const values = timespan.map(({ value }) => value)
  return _weightedAverage(values, weights, fun)
}

function _weightedAverage(values: bigint[], weights: bigint[], _weightFun: (w: bigint) => [bigint, bigint]): bigint {
  let mul = BigInt(0), div = BigInt(0)
  for (let i = 0; i < values.length; i++) {
    const [weightMul, weightDiv] = _weightFun(weights[i])
    mul += weightMul * values[i]
    div += weightDiv
  }
  return div > BigInt(0) ? MAX_BIPS * mul / div : BigInt(0)
}

/**
 * This is a chosen weight function implementation.
 * It should give more weight to recent values.
 * @param t timestamp/weight
 * @param T latest time
 * @param d delta
 * @returns [mul, div] weights
 */
function weightFun(t: number, T: number, d: number): [mul: bigint, div: bigint] {
  const w = BigInt(t - (T - d))
  return [BigInt(d) * w, w * w]
}