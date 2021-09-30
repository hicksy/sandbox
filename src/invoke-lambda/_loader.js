let { readFileSync } = require('fs')
let { join } = require('path')
let lTrimm = l => l.trim() !== '' // boom
let handlers

module.exports = function (inventory) {
  let {inv} = inventory
  if (handlers) return handlers
  handlers = {}
  let runtimes = [ 'deno.js', 'node.js', 'python.py', 'ruby.rb' ]
  runtimes.forEach(runtime => {
    try {
      let name = runtime.split('.')[0]
      let path = join(__dirname, 'runtimes', runtime)
      let boot = readFileSync(path).toString()
      let script
      if (runtime.endsWith('.js')) {
        script = '"' + boot.replace(/\n/g, '').trim() + '"'
      }
      if (runtime.endsWith('.py')) {
        script = '"' + boot.split('\n').filter(lTrimm).join(';') + '"'
      }
      if (runtime.endsWith('.rb')) {
        script = boot
          .split('\n')
          .filter(lTrimm)
          .map(line => [ '-e', `"${line}"` ])
          .reduce((a, b) => a.concat(b))
      }
      handlers[name] = script
    }
    catch (err) {
      throw Error(err)
    }
  })
  if (inv._project.plugins) {
    Object.values(inv._project.plugins).
    map(pluginModule => pluginModule?.sandbox?.runtime || null).
    filter(runtime => runtime).
    map(runtime => {
      if(runtime.name?.length && runtime.handler?.length) {
        handlers[runtime.name] = runtime.handler
      }
    })
  }
  return handlers
}
