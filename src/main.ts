import { Game } from './game'

const container = document.getElementById('app')
const hint = document.getElementById('hint')
if (!container || !hint) {
  throw new Error('Missing #app or #hint')
}

new Game(container, hint)
