let $ = require('jquery')
const PREFIX_REGEXP = /(x[\:\-_]|data[\:\-_])/i
function nodeName (element) {
  return element.nodeName ? element.nodeName : element[0].nodeName
}
function directiveNormalize (name) {
  return _.camelCase(name.replace(PREFIX_REGEXP, ''))
}
function $CompileProvider ($provide) {
  var hasDirectives = {}
  this.directive = function (name, directiveFactory) {
    if (_.isString(name)) {
      if (name === 'hasOwnProperty') {
        throw 'hasOwnProperty is not a valid directive name'
      }
      if (!hasDirectives.hasOwnProperty(name)) {
        hasDirectives[name] = []

        $provide.factory(name + 'Directive', ['$injector', function ($injector) {
          var factories = hasDirectives[name]
          // directive.name = directive.name || name
          // $injector.invoke
          return _.map(factories, (factory, i) => {
            let directive = $injector.invoke(factory)
            directive.name = directive.name || name
            directive.priority = directive.priority || 0
            directive.index = i
            return directive
          })
        }])
      }
      hasDirectives[name].push(directiveFactory)
    }else {
      _.forEach(name, (directiveFactory, name) => {
        this.directive(name, directiveFactory)
      })
    }

  // $provide.factory(name + 'Directive', directiveFactory)
  }
  this.$get = ['$injector', function ($injector) {
    function addDirective (directives, name) {
      if (hasDirectives.hasOwnProperty(name)) {
        directives.push.apply(directives, $injector.get(name + 'Directive'))
      }
    }
    function collectDirectives (node) {
      let directives = []
      let normalizedNodeName = directiveNormalize(nodeName(node).toLowerCase())
      addDirective(directives, normalizedNodeName)
      _.forEach(node.attributes, attr => {
        let normalizedAttrName = directiveNormalize(attr.name.toLowerCase())
        if (/^ngAttr[A-Z]/.test(normalizedAttrName)) {
          normalizedAttrName = normalizedAttrName[6].toLowerCase() + normalizedAttrName.substring(7)
        }
        addDirective(directives, normalizedAttrName)
      })
      _.forEach(node.classList, cls => {
        let normalizedClassName = directiveNormalize(cls)
        addDirective(directives, normalizedClassName)
      })
      directives.sort(byPriority)
      return directives
    }
    function byPriority (a, b) {
      let diff = b.priority - a.priority
      if (diff !== 0) {
        return diff
      } else {
        if (a.name !== b.name) {
          return (a.name < b.name ? -1 : 1)
        } else {
          return a.index - b.index
        }
      }
    }
    function applyDirectivesToNode (directives, compileNode) {
      var $compileNode = $(compileNode)
      _.forEach(directives, function (directive) {
        if (directive.compile) {
          directive.compile($compileNode)
        }
      })
    }
    function compileNodes ($compileNodes) {
      _.forEach($compileNodes, (node) => {
        let directives = collectDirectives(node)
        applyDirectivesToNode(directives, node)
        if (node.childNodes && node.childNodes.length) {
          compileNodes(node.childNodes)
        }
      })
    }
    function compile ($compileNodes) {
      return compileNodes($compileNodes)
    }
    return compile
  }]
}
$CompileProvider.$inject = ['$provide']

export { $CompileProvider }
