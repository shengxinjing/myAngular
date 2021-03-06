// let filter = require('./filter').filter
const ESCAPES = {
  'n': '\n',
  'f': '\f',
  'r': '\r',
  't': '\t',
  'v': '\v',
  "'": "'",
  '"': '"'
}

const OPEARTORS = {
  '+': true,
  '!': true,
  '-': true,
  '*': true,
  '/': true,
  '%': true,
  '=': true,
  '==': true,
  '!=': true,
  '===': true,
  '!==': true,
  '>': true,
  '<': true,
  '>=': true,
  '<=': true,
  '&&': true,
  '||': true,
  '|': true
}

function ifDefined (value, defaultValue) {
  return typeof value === 'undefined' ? defaultValue : value
}

function constantWatchDelegate (scope, listenFn, valueEq, watchFn) {
  const unwatch = scope.$watch(() => watchFn(scope), (...args) => {
    if (_.isFunction(listenFn)) {
      listenFn.apply(this, args)
    // this::listenFn(...args)
    }
    unwatch()
  }, valueEq)
  return unwatch
}

function oneTimeWatchDelegate (scope, listenFn, valueEq, watchFn) {
  let lastVal
  const unwatch = scope.$watch(() => watchFn(scope), (newVal, oldVal, scope) => {
    lastVal = newVal // newVal
    if (_.isFunction(listenFn)) {
      listenFn.apply(this, [newVal, oldVal, scope])
    // this::listenFn(newVal, oldVal, scope)
    }
    if (!_.isUndefined(newVal)) {
      scope.$$postDigest(() => {
        if (!_.isUndefined(lastVal)) {
          unwatch()
        }
      })
    }
  }, valueEq)
  return unwatch
}

function oneTimeLiteralWatchDelegate (scope, listenFn, valueEq, watchFn) {
  const isAllDefined = val => !_.some(val, _.isUndefined)
  const unwatch = scope.$watch(() => watchFn(scope), (newVal, oldVal, scope) => {
    if (_.isFunction(listenFn)) {
      listenFn.apply(this, [newVal, oldVal, scope])

    // this::listenFn(newVal, oldVal, scope)
    }
    if (isAllDefined(newVal)) {
      scope.$$postDigest(() => {
        if (isAllDefined(newVal)) {
          unwatch()
        }
      })
    }
  }, valueEq)
  return unwatch
}

function isLiteral (ast) {
  return ast.body.length === 0 ||
  ast.body.length === 1 && (
  ast.body[0].type === AST.Literal ||
  ast.body[0].type === AST.ArrayExpression ||
  ast.body[0].type === AST.ObjectExpression

  )
}

function markConstantExpressions (ast, $filter) {
  let allConstants
  switch (ast.type) {
    case AST.Literal:
      ast.constant = true
      break
    case AST.Identifier:
      ast.constant = false
      break
    case AST.ThisExpression:
      ast.constant = false
      break
    case AST.MemberExpression:
      markConstantExpressions(ast.object, $filter)

      if (ast.computed) {
        markConstantExpressions(ast.property, $filter)
      }
      ast.constant = ast.object.constant && (!ast.computed || ast.property.constant)
      break
    case AST.ArrayExpression:
      allConstants = true
      _.forEach(ast.elements, element => {
        markConstantExpressions(element, $filter)
        allConstants = allConstants && element.constant
      })
      ast.constant = allConstants
      break
    case AST.ObjectExpression:
      allConstants = true
      _.forEach(ast.properties, property => {
        markConstantExpressions(property.value, $filter)
        allConstants = allConstants && property.value.constant
      })
      ast.constant = allConstants
      break
    case AST.CallExpression:
      // allConstants = a
      allConstants = !!ast.filter
      _.forEach(ast.arguments, argument => {
        markConstantExpressions(argument, $filter)
        allConstants = allConstants && argument.constant
      })
      ast.constant = allConstants
      break
    case AST.AssignmentExpression:
      markConstantExpressions(ast.left, $filter)
      markConstantExpressions(ast.right, $filter)
      ast.constant = ast.left.constant && ast.right.constant
      break
    case AST.UnaryExpression:
      markConstantExpressions(ast.argument, $filter)
      ast.constant = ast.argument.constant
      break
    case AST.BinartExpression:
    case AST.LogicalExpression:
      markConstantExpressions(ast.left, $filter)
      markConstantExpressions(ast.right, $filter)
      ast.constant = ast.left.constant && ast.right.constant
      break

    case AST.Program:
      allConstants = true
      _.forEach(ast.body, expr => {
        markConstantExpressions(expr, $filter)
        allConstants = allConstants && expr.constant
      })
      ast.constant = allConstants
      break
  }
}
// 词法解析器a+b=> a,+,b
class Lexer {
  // 解析
  lex (text) {
    Object.assign(this, { text})
    // this.text = text
    this.index = 0
    this.ch = undefined
    this.tokens = []
    while (this.index < this.text.length) {
      this.ch = this.text.charAt(this.index)
      if (this.isNumber(this.ch) || (this.ch === '.' && this.isNumber(this.peek()))) {
        this.readNumber()
      // console.log(this.tokens)
      } else if (this.is('\'"')) {
        // 字符串
        this.readString(this.ch)
      } else if (this.isIdent(this.ch)) {
        // 不是引号开头，是字母，或者_或者$,可能是变量，或者是true false null
        // 也有可能是object的key没有引号要加上引号处理
        this.readIdent()
      } else if (this.isWhiteSpace(this.ch)) {
        // 空格忽略不计
        this.index++
      } else if (this.is('[]{}:,.()?;')) {
        // 这些符号都专门切开，数组 对象 函数 赋值
        this.tokens.push({
          text: this.ch
        })
        this.index++
      } else {
        const ch = this.ch
        const ch2 = this.ch + this.peek()
        const ch3 = this.ch + this.peek() + this.peek(2)
        const op = OPEARTORS[ch]
        const op2 = OPEARTORS[ch2]
        const op3 = OPEARTORS[ch3]
        if (op || op2 || op3) {
          const token = op3 ? ch3 : (op2 ? ch2 : ch)
          this.tokens.push({
            text: token
          })
          this.index += token.length
        } else {
          throw 'unexpect next character ' + this.ch
        }
      }
    }
    // console.log(this.tokens)
    return this.tokens
  }
  // 是不是数字
  isNumber (ch) {
    return ch >= '0' && ch <= '9'
  }
  isExpOperator (ch) {
    return ch === '+' || ch === '-' || this.isNumber(ch)
  }
  isIdent (ch) {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_' || ch === '$'
  }
  isWhiteSpace (ch) {
    return ch === ' ' || ch === '\r' || ch === '\t' || ch === '\n' || ch === '\v' || ch === '\u00A0'
  }
  is (chs) {
    return chs.indexOf(this.ch) >= 0
  }
  // 获取下一个位置字符，判断.42这种，小数点后面是不是数字，是数字要补0
  peek (n) {
    n = n || 1
    return this.index + n < this.text.length ? this.text.charAt(this.index + n) : false
  }
  // 挨个读取数字和小数点
  readNumber () {
    let number = ''
    while (this.index < this.text.length) {
      const ch = this.text.charAt(this.index).toLowerCase()
      if (ch === '.' || this.isNumber(ch)) {
        number += ch
      } else {
        // break
        const nextCh = this.peek()
        const prevCh = number.charAt(number.length - 1)
        if (ch === 'e' && this.isExpOperator(nextCh)) {
          number += ch
        } else if (this.isExpOperator(ch) && prevCh === 'e' && nextCh && this.isNumber(nextCh)) {
          number += ch
        } else if (this.isExpOperator(ch) && prevCh === 'e' && (!nextCh || !this.isNumber(nextCh))) {
          throw 'invalid exponent'
        } else {
          break
        }
      }
      this.index++
    }
    this.tokens.push({
      text: number,
      value: Number(number)
    })
  }
  // 读字符串
  readString (quote) {
    this.index++
    let string = ''
    let rawString = quote
    let escape = false
    while (this.index < this.text.length) {
      const ch = this.text.charAt(this.index)
      rawString += ch
      // \\后面的字符，看是不是有转义
      if (escape) {
        // \后面u开头的 是16进制编码，需要用fromCharCode解码
        if (ch === 'u') {
          const hex = this.text.substring(this.index + 1, this.index + 5)
          if (!hex.match(/[\da-f]{4}/i)) {
            throw 'invalid unicode escape'
          }
          this.index += 4
          string += String.fromCharCode(parseInt(hex, 16))
        } else {
          const replacement = ESCAPES[ch]
          if (replacement) {
            string += replacement
          } else {
            string += ch
          }
        }
        escape = false
      } else if (ch === '\\') {
        escape = true
      } else if (ch === quote) {
        this.index++
        this.tokens.push({
          text: rawString,
          value: string
        })
        return
      } else {
        string += ch
      }
      this.index++
    }
    throw 'unmathed quote'
  }
  readIdent () {
    let text = ''
    while (this.index < this.text.length) {
      const ch = this.text.charAt(this.index)
      if (this.isIdent(ch) || this.isNumber(ch)) {
        text += ch
      } else {
        break
      }
      this.index++
    }
    this.tokens.push({
      text: text,
      identifier: true
    })
  }
}
// 抽象树生成a,+,b=>{oper:'+',left:{},right:{}}
class AST {
  constructor (lexer) {
    this.lexer = lexer
    // 怎么给class的原型属性赋值 先写这里吧
    this.constants = {
      'null': {
        type: AST.Literal,
        value: null
      },
      'true': {
        type: AST.Literal,
        value: true
      },
      'false': {
        type: AST.Literal,
        value: false
      },
      'this': {
        type: AST.ThisExpression
      }
    }
  }
  ast (text) {
    this.tokens = this.lexer.lex(text)
    // console.log(JSON.stringify(this.tokens,null,2))

    return this.program()
  }
  program () {
    const body = []
    while (true) {
      if (this.tokens.length) {
        body.push(this.filter())
      }
      if (!this.expect(';')) {
        return {
          type: AST.Program,
          body: body
        }
      }
    }
  }
  primary () {
    let primary
    if (this.expect('(')) {
      primary = this.filter()
      this.consume(')')
    } else if (this.expect('[')) {
      primary = this.arrayDeclaration()
    } else if (this.expect('{')) {
      primary = this.object()
    } else if (this.constants.hasOwnProperty(this.tokens[0].text)) {
      primary = this.constants[this.consume().text]
    } else if (this.peek().identifier) {
      primary = this.identifier()
    } else {
      primary = this.constant()
    }
    let next
    while (next = this.expect('.', '[', '(')) {
      if (next.text === '[') {
        // a[b]
        primary = {
          type: AST.MemberExpression,
          object: primary,
          property: this.primary(),
          computed: true
        }
        this.consume(']')
      } else if (next.text === '.') {
        // a.b
        primary = {
          type: AST.MemberExpression,
          object: primary,
          property: this.identifier(),
          computed: false

        }
      } else if (next.text === '(') {
        // 函数
        primary = {
          type: AST.CallExpression,
          callee: primary,
          arguments: this.parseArguments()
        }
        this.consume(')')
      }
    }
    return primary
  }
  assignment () {
    const left = this.ternary()
    if (this.expect('=')) {
      const right = this.ternary()
      return {
        type: AST.AssignmentExpression,
        left: left,
        right: right
      }
    }
    return left
  }
  parseArguments () {
    const args = []
    if (!this.peek(')')) {
      do {
        args.push(this.assignment())
      } while (this.expect(','))
    }
    return args
  }
  object () {
    const properties = []
    if (!this.peek('}')) {
      do {
        const property = {
          type: AST.Property
        }
        if (this.peek().identifier) {
          property.key = this.identifier()
        } else {
          property.key = this.constant()
        }
        this.consume(':')
        property.value = this.assignment()
        properties.push(property)
      } while (this.expect(','))
    }
    this.consume('}')
    return {
      type: AST.ObjectExpression,
      properties: properties
    }
  }
  // 描述array
  arrayDeclaration () {
    const elements = []
    if (!this.peek(']')) {
      do {
        if (this.peek(']')) {
          break
        }
        elements.push(this.assignment())
      } while (this.expect(','))
    }
    this.consume(']')
    return {
      type: AST.ArrayExpression,
      elements: elements
    }
  }
  consume (e) {
    const token = this.expect(e)
    if (!token) {
      throw 'unexpect expecting' + e
    }
    return token
  }
  expect (e1, e2, e3, e4) {
    const token = this.peek(e1, e2, e3, e4)
    if (token) {
      return this.tokens.shift()
    }
  }
  peek (e1, e2, e3, e4) {
    // tokens第一个的text是e或者e不存在，就返回token第一个
    if (this.tokens.length > 0) {
      const text = this.tokens[0].text
      if (text === e1 || text === e2 || text === e3 || text === e4 || (!e1 && !e2 && !e3 && !e4)) {
        return this.tokens[0]
      }
    }
  }
  constant () {
    return {
      type: AST.Literal,
      value: this.consume().value
    }
  }
  identifier () {
    return {
      type: AST.Identifier,
      name: this.consume().text
    }
  }
  unary () {
    let token
    if (token = this.expect('+', '!', '-')) {
      return {
        type: AST.UnaryExpression,
        operator: token.text,
        argument: this.unary()
      }
    } else {
      return this.primary()
    }
  }
  multiplicative () {
    let left = this.unary()
    let token
    // 多个复杂计算，用while
    while (token = this.expect('*', '/', '%')) {
      left = {
        type: AST.BinartExpression,
        left: left,
        operator: token.text,
        right: this.unary()
      }
    }
    return left
  }
  additive () {
    let left = this.multiplicative()
    let token
    while (token = this.expect('+', '-')) {
      left = {
        type: AST.BinartExpression,
        left: left,
        operator: token.text,
        right: this.multiplicative()
      }
    }
    return left
  }
  relational () {
    let left = this.additive()
    let token
    while (token = this.expect('<', '>', '<=', '>=')) {
      left = {
        type: AST.BinartExpression,
        left: left,
        operator: token.text,
        right: this.additive()
      }
    }
    return left
  }
  equality () {
    let left = this.relational()
    let token
    while (token = this.expect('==', '!=', '===', '!==')) {
      left = {
        type: AST.BinartExpression,
        left: left,
        operator: token.text,
        right: this.relational()
      }
    }
    return left
  }
  logicalAND () {
    let left = this.equality()
    let token
    while (token = this.expect('&&')) {
      left = {
        type: AST.LogicalExpression,
        left: left,
        operator: token.text,
        right: this.equality()
      }
    }
    return left
  }
  logicalOR () {
    let left = this.logicalAND()
    let token
    while (token = this.expect('||')) {
      left = {
        type: AST.LogicalExpression,
        left: left,
        operator: token.text,
        right: this.logicalAND()
      }
    }
    return left
  }
  ternary () {
    const test = this.logicalOR()
    if (this.expect('?')) {
      const consequent = this.assignment()
      if (this.consume(':')) {
        const alternate = this.assignment()
        return {
          type: AST.ConditionalExpression,
          test: test,
          consequent: consequent,
          alternate: alternate
        }
      }
    }
    return test
  }
  filter () {
    let left = this.assignment()
    while (this.expect('|')) {
      const arg = [left]
      left = {
        type: AST.CallExpression,
        callee: this.identifier(),
        arguments: arg,
        filter: true
      }
      while (this.expect(':')) {
        arg.push(this.assignment())
      }
    }
    return left
  }
}
AST.Program = 'Program'
AST.Literal = 'Literal'
AST.ArrayExpression = 'ArrayExpression'
AST.ObjectExpression = 'ObjectExpression'
AST.Property = 'Property'
AST.Identifier = 'Identifier'
AST.ThisExpression = 'ThisExpression'
AST.MemberExpression = 'MemberExpression'
AST.CallExpression = 'CallExpression'
AST.AssignmentExpression = 'AssignmentExpression'
AST.UnaryExpression = 'UnaryExpression'
AST.BinartExpression = 'BinartExpression'
AST.LogicalExpression = 'LogicalExpression'
AST.ConditionalExpression = 'ConditionalExpression'
// 抽象树遍历 = 最后一步 scope.a+scope.b
class ASTCompiler {
  constructor (astBuilder, $filter) {
    this.astBuilder = astBuilder
    this.$filter = $filter
    // 怎么给class的原型属性赋值 先写这里吧
    this.stringEscapeRegx = /[^ a-zA-Z0-9]/g
    // 返回函数字符串的参数 第一个参数scope fn(s,l){var v0,v1xxxxx}
    this.arguScope = 's'
    // 第二个参数 Locals
    this.arguLocals = 'l'
  }
  compile (text) {
    const ast = this.astBuilder.ast(text)
    markConstantExpressions(ast, this.$filter)
    // vars需要用到的变量v0v1方便函数一开始就var定义好
    // vars一开始放一个，拼var a,b的时候就不用判断length了 偷个懒 囧
    this.state = {
      body: [],
      nextId: 0,
      vars: ['_test_var'],
      filters: {}
    }
    this.recurse(ast)
    const fnString = this.filterPrefix() +
      'var fn = function(s,l){' +
      'var ' + this.state.vars.join(',') + ' ;' +
      this.state.body.join('') +
      '};return fn;'
    const fn = new Function('ifDefined', 'filter', fnString)(ifDefined, this.$filter)
    // literal标明是不是一个字面量，不需要计算，比如数字 数字对象都算，但是1+2这种需要计算的就不是
    fn.literal = isLiteral(ast)
    fn.constant = ast.constant
    return fn
  }
  filterPrefix () {
    if (_.isEmpty(this.state.filters)) {
      return ''
    } else {
      const parts = _.map(this.state.filters, (varName, filterName) => {
        return varName + '=' + 'filter(' + this.escape(filterName) + ')'
      }, this)
      return 'var ' + parts.join(',') + ';'
    }
  }
  // create 赋值对象不存在 是不是创建
  recurse (ast, context, create) {
    let varid
    switch (ast.type) {
      case AST.Program:
        _.forEach(_.initial(ast.body), stmt => {
          this.state.body.push(this.recurse(stmt), ';')
        }, this)
        this.state.body.push('return ', this.recurse(_.last(ast.body)), ';')
        break
      case AST.Literal:
        return this.escape(ast.value)
      case AST.ArrayExpression:
        const elements = _.map(ast.elements, element => {
          return this.recurse(element)
        }, this)
        return '[' + elements.join(',') + ']'
      case AST.ObjectExpression:
        const properties = _.map(ast.properties, property => {
          const key = property.key.type === AST.Identifier
            ? property.key.name
            : this.escape(property.key.value)
          const value = this.recurse(property.value)
          return key + ':' + value
        }, this)
        return '{' + properties.join(',') + '}'
      case AST.Identifier:
        varid = this.nextId()
        this._if(this.getHasOwnProperty(this.arguLocals, ast.name),
          this.assign(varid, this.nonComputedMember(this.arguLocals, ast.name)))
        if (create) {
          this._if(this.not(this.getHasOwnProperty(this.arguLocals, ast.name)) +
          ' && s && ' +
          this.not(this.getHasOwnProperty(this.arguScope, ast.name)),
            this.assign(this.nonComputedMember(this.arguScope, ast.name), '{}'))
        }
        this._if(this.not(this.getHasOwnProperty(this.arguLocals, ast.name)) + '&&' + this.arguScope,
          this.assign(varid, this.nonComputedMember(this.arguScope, ast.name)))
        if (context) {
          context.context = this.getHasOwnProperty('l', ast.name) + '?l:s'
          context.name = ast.name
          context.computed = false
        }
        return varid
      case AST.ThisExpression:
        // 如果是this 直接返回函数传递的参数
        return this.arguScope
      case AST.MemberExpression:
        varid = this.nextId()
        const left = this.recurse(ast.object, undefined, create)
        if (context) {
          context.context = left
        }
        if (ast.computed) {
          const right = this.recurse(ast.property)
          if (create) {
            this._if(this.not(this.computedMember(left, right)),
              this.assign(this.computedMember(left, right), '{}'))
          }
          this._if(left, this.assign(varid, this.computedMember(left, right)))
          if (context) {
            context.name = right
            context.computed = true
          }
        } else {
          if (create) {
            this._if(this.not(this.nonComputedMember(left, ast.property.name)),
              this.assign(this.nonComputedMember(left, ast.property.name), '{}'))
          }

          this._if(left, this.assign(varid, this.nonComputedMember(left, ast.property.name)))
          if (context) {
            context.name = ast.property.name
            context.computed = false
          }
        }
        return varid
      case AST.CallExpression:
        // 函数
        let callContext, callee, args
        if (ast.filter) {
          callee = this.filter(ast.callee.name)
          // console.log(callee)
          args = _.map(ast.arguments, (arg) => {
            return this.recurse(arg)
          }, this)
          return callee + '(' + args + ')'
        } else {
          callContext = {}
          callee = this.recurse(ast.callee, callContext)
          args = _.map(ast.arguments, (arg) => {
            return this.recurse(arg)
          }, this)
          if (callContext.name) {
            if (callContext.computed) {
              callee = this.computedMember(callContext.context, callContext.name)
            } else {
              callee = this.nonComputedMember(callContext.context, callContext.name)
            }
          }
          return callee + '&&' + callee + '(' + args.join(',') + ')'
        }
      // break
      case AST.AssignmentExpression:
        const leftContext = {}
        this.recurse(ast.left, leftContext, true)
        let leftExpr
        if (leftContext.computed) {
          leftExpr = this.computedMember(leftContext.context, leftContext.name)
        } else {
          leftExpr = this.nonComputedMember(leftContext.context, leftContext.name)
        }
        return this.assign(leftExpr, this.recurse(ast.right))
      case AST.UnaryExpression:
        return ast.operator + '(' + this.ifDefined(this.recurse(ast.argument), 0) + ')'
      case AST.BinartExpression:
        // 乘除
        return '(' + this.recurse(ast.left) + ')' + ast.operator + '(' + this.recurse(ast.right) + ')'
      case AST.LogicalExpression:
        varid = this.nextId()
        this.state.body.push(this.assign(varid, this.recurse(ast.left)))
        this._if(ast.operator === '&&' ? varid : this.not(varid),
          this.assign(varid, this.recurse(ast.right)))
        return varid
      case AST.ConditionalExpression:
        varid = this.nextId()
        const testId = this.nextId()
        this.state.body.push(this.assign(testId, this.recurse(ast.test)))

        this._if(testId, this.assign(varid, this.recurse(ast.consequent)))

        this._if(this.not(testId), this.assign(varid, this.recurse(ast.alternate)))
        return varid
    }
  }
  filter (name) {
    if (!this.state.filters.hasOwnProperty(name)) {
      this.state.filters[name] = this.nextId(true)
    }
    return this.state.filters[name]
  }
  ifDefined (value, defaultValue) {
    return 'ifDefined(' + value + ',' + this.escape(defaultValue) + ')'
  }
  nonComputedMember (left, right) {
    return '(' + left + ').' + right
  }
  computedMember (left, right) {
    return '(' + left + ')[' + right + ']'
  }
  assign (id, value) {
    return id + '=' + value + ';'
  }
  nextId (skip) {
    const vid = 'v' + (this.state.nextId++)
    if (!skip) {
      this.state.vars.push(vid)
    }
    return vid
  }
  escape (value) {
    if (_.isString(value)) {
      return "'" + value.replace(this.stringEscapeRegx, this.stringEscapeFn) + "'"
    } else if (_.isNull(value)) {
      return 'null'
    } else {
      return value
    }
  }
  _if (test, consequent) {
    this.state.body.push('if(' + test + '){' + consequent + '}')
  }
  not (e) {
    return '!(' + e + ')'
  }
  getHasOwnProperty (object, property) {
    return object + '&&(' + this.escape(property) + ' in ' + object + ')'
  }
  stringEscapeFn (c) {
    // 16进制 比如 '变成\u0027 转译字符'a'b'就不会出错，变成'a\u0027b'
    // console.log(c,'\\u'+('0000'+c.charCodeAt(0).toString(16)).slice(-4))
    return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4)
  }
}
// ASTCompiler.stringEscapeRegx = /[^a-zA-Z0-9]/g

class Parser {
  constructor (lexer, $filter) {
    this.lexer = lexer
    this.ast = new AST(this.lexer)
    this.astCompiler = new ASTCompiler(this.ast, $filter)
  }
  parse (text) {
    // return new Function('return '+text+';')
    return this.astCompiler.compile(text)
  }
}

function $ParseProvider () {
  this.$get = ['$filter', function ($filter) {
    return (expr) => {
      switch (typeof expr) {
        case 'string':
          const lexer = new Lexer()
          const parser = new Parser(lexer, $filter)
          let onetime = false
          if (expr.charAt(0) === ':' && expr.charAt(1) === ':') {
            onetime = true
            expr = expr.substring(2)
          }
          const parseFn = parser.parse(expr)
          if (parseFn.constant) {
            parseFn.$$watchDelegate = constantWatchDelegate
          } else if (onetime) {
            parseFn.$$watchDelegate = parseFn.literal ? oneTimeLiteralWatchDelegate : oneTimeWatchDelegate
          }
          return parseFn
        case 'function':
          return expr
        default:
          return _.noop
      }
    }
  }]
}

export { $ParseProvider }
