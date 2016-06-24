function comparator (actual, expected) {
  if (_.isUndefined(actual)) {
    return false
  }
  if (_.isNull(actual) || _.isNull(expected)) {
    return actual === expected
  }
  // console.log(actual, expected)
  actual = String(actual).toLowerCase()
  expected = String(expected).toLowerCase()
  return actual.indexOf(expected) >= 0
}
function deepCompare (actual, expected, matchAnyProperty, isWildcard) {
  if (_.isString(actual) && _.startsWith(expected, '!')) {
    return !deepCompare(actual, expected.substring(1), matchAnyProperty)
  }
  if (_.isArray(actual)) {
    return _.some(actual, actualItem => {
      return deepCompare(actualItem, expected, matchAnyProperty)
    })
  }
  if (_.isObject(actual)) {
    if (_.isObject(expected) && !isWildcard) {
      return _.every(
        _.toPlainObject(expected),
        (val, key) => {
          if (_.isUndefined(val)) {
            return true
          }
          const isWildcard = (key === '$')
          const actualval = isWildcard ? actual : actual[key]
          return deepCompare(actualval, val, isWildcard, isWildcard)
        }
      )
    } else if (matchAnyProperty) {
      return _.some(actual, value => {
        return deepCompare(value, expected, matchAnyProperty)
      })
    }
  } else {
    return comparator(actual, expected)
  }
}
function createPredicateFn (expression) {
  const shouldMatchPrimitives = _.isObject(expression) && ('$' in expression)

  return item => {
    if (shouldMatchPrimitives && !_.isObject(item)) {
      return deepCompare(item, expression.$)
    }
    return deepCompare(item, expression, true)
  }
}

function filterFilter () {
  return (arr, filterExpr) => {
    let fn
    if (_.isFunction(filterExpr)) {
      fn = filterExpr
    } else if (_.isString(filterExpr) ||
      _.isNumber(filterExpr) ||
      _.isBoolean(filterExpr) ||
      _.isNull(filterExpr) ||
      _.isObject(filterExpr)) {
      fn = createPredicateFn(filterExpr)
    } else {
      return arr
    }
    return _.filter(arr, fn)
  }
}

// register('filter',filterFilter)

export { filterFilter }
