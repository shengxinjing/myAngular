'use strict'

function initWatchFn() {}

class Scope {
  constructor() {
    // $watch队列
    this.$$watchers = []
    this.$$lastDirtyWatch = null
      // $evalasync队列
    this.$$asyncQueue = []
    // applyAsync队列
    this.$$applyAsyncQueue = []
    // $postDigest队列
    this.$$postDigestQueue = []
    this.$$applyAsyncId = null
    //记录子scope 方便递归digest $new中维护
    this.$$children = []
    // 记录状态是$digest，还是$apply
    this.$$phase = null
  }
  // 监听
  $watch(watchFn, listenerFn, valueEq) {
    let watcher = {
      watchFn: watchFn,
      listenerFn: listenerFn || function() {},
      last: initWatchFn,
      valueEq: !!valueEq //是否递归比较
    }
    this.$$watchers.unshift(watcher)
    // 上次dirty出发的watchFn
    this.$$lastDirtyWatch = null
    // 返回函数，执行可以注销watch 直接执行splice
    return ()=>{
      let index = this.$$watchers.indexOf(watcher)
      if (index>=0) {
        this.$$watchers.splice(index,1)
        this.$$lastDirtyWatch = null

      };
    }
  }
  $new(){
    let childScope = Object.create(this)
    // 保存在$$children中
    this.$$children.push(childScope)
    // 每个继承的scope有自己的wathcers
    childScope.$$watchers = []
    childScope.$$children = []
    return childScope
  }
  // 监听多个
  $watchGroup(watchFns, listenerFn){
    let newVals = new Array(watchFns.length)
    let oldVals = new Array(watchFns.length)

    let changeReactionScheduled = false
    let firstRun = true

    if (watchFns.length===0) {
      let shouldCall = true
      this.$evalAsync(()=>{
        if (shouldCall) {
          listenerFn(newVals,newVals,this)
        }
      })
      return ()=>{
        shouldCall= false
      }
    };

    let watchGroupListener = ()=>{
      if (firstRun) {
        firstRun = false
        listenerFn(newVals,newVals,this)

      }else{
        listenerFn(newVals,oldVals,this)

      }
      changeReactionScheduled = false
    }

    let destroyFns = _.map(watchFns,(watchFn,i)=>{
      return this.$watch(watchFn,(newVal,oldVal)=>{
        newVals[i] = newVal
        oldVals[i] = oldVal
        // evalAsync是最后才执行的
        if (!changeReactionScheduled) {
          changeReactionScheduled=true
          this.$evalAsync(watchGroupListener)
          // listenerFn(newVals,oldVals,this)

        };
      })
    })

    return ()=>{
      destroyFns.forEach((desFn,i)=>{
        desFn()
      })
    }
  }
  $digest() {
    let dirty
      //十次都不稳定，就报错
    let ttl = 10
      //记录上次dirty的watch
    this.$$lastDirtyWatch = null
      //用$$phase记录状态
    this.$begainPhase('$digest')

    if (this.$$applyAsyncId) {
      clearTimeout(this.$$applyAsyncId)
      this.$$flushApplyAsync()
    };
    do {
      // evalasync队列取出执行
      while (this.$$asyncQueue.length) {
        let asyncTask = this.$$asyncQueue.shift()
        try{
          asyncTask.scope.$eval(asyncTask.expression)
        }catch(e){
          console.log(e)
        }

      }
      dirty = this.$$digestOnce()
      if ((dirty || this.$$asyncQueue.length) && !(ttl--)) {
        throw '10 digest interations reached'
      };
    } while (dirty || this.$$asyncQueue.length)
    this.$clearPhase()

    // postdigest
    while (this.$$postDigestQueue.length) {
      try{
        this.$$postDigestQueue.shift()()
      }catch(e){
        console.error(e)
      }

    }

  }
  $eval(fn, arg) {
    return fn(this, arg)
  }
  $apply(fn) {
    try {
      this.$begainPhase('$apply')
      return this.$eval(fn)
    } finally {
      this.$clearPhase()
      this.$digest()
    }
  }
  $evalAsync(fn) {
    if (!this.$$phase && !this.$$asyncQueue.length) {
      setTimeout(() => {
        if (this.$$asyncQueue.length) {
          this.$digest()
        };
      }, 0)
    }
    this.$$asyncQueue.push({
      scope: this,
      expression: fn
    })
  }
  $applyAsync(fn) {
    this.$$applyAsyncQueue.push(() => {
      this.$eval(fn)
    })
    if (this.$$applyAsyncId === null) {
      this.$$applyAsyncId = setTimeout(() => {
        this.$apply(() => {
            this.$$flushApplyAsync()
          })
          // this.$apply(_.bind(this.$$flushApplyAsync,this))
      }, 0)
    };

  }
  $$flushApplyAsync() {
    while (this.$$applyAsyncQueue.length) {
      try{
        this.$$applyAsyncQueue.shift()()

      }catch(e){
        console.log(e)
      }
    }
    this.$$applyAsyncId = null
  }
  $$postDigest(fn) {
    this.$$postDigestQueue.push(fn)
  }
  $$digestOnce() {
    let newVal, oldVal, dirty
    _.forEachRight(this.$$watchers, (watcher) => {

      try {
        newVal = watcher.watchFn(this)
        oldVal = watcher.last
        if (!this.$$areEqual(newVal, oldVal, watcher.valueEq)) {
          this.$$lastDirtyWatch = watcher
          watcher.last = (watcher.valueEq ? _.cloneDeep(newVal) : newVal)
          watcher.listenerFn(newVal, (oldVal === initWatchFn ? newVal : oldVal), this)
          dirty = true
        } else if (this.$$lastDirtyWatch === watcher) {
          //lodash的foreach return false 就顺便中断了
          return false
        }

      }catch(e) {
        console.log(e)
      }

    })
    return dirty
  }
  $$areEqual(newVal, oldVal, valueEq) {
    if (valueEq) {
      return _.isEqual(newVal, oldVal)
    } else {
      //handle NaN
      return newVal === oldVal || (newVal !== newVal && oldVal !== oldVal)
    }
  }
  $begainPhase(phase) {
    if (this.$$phase) {
      throw this.$$phase + 'already in progress'
    } else {
      this.$$phase = phase
    }
  }
  $clearPhase() {
    this.$$phase = null
  }
}
module.exports = Scope;