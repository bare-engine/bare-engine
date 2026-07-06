const ids = new WeakMap<object, number>()
let nextId = 0

export function id(value: object) {
  if (!ids.has(value)) {
    ids.set(value, nextId++)
  }

  return ids.get(value)!
}
