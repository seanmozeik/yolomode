import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const IMAGE = 'yolomode';
export const HOME = process.env.HOME ?? '';
export const FORWARDS_DIR = join(tmpdir(), 'yolomode-forwards');
export const PERSISTENT_VOLUMES = {
  cargoGit: 'yolomode-cargo-git',
  cargoRegistry: 'yolomode-cargo-registry',
  cargoTarget: 'yolomode-cargo-target',
  rustup: 'yolomode-rustup',
  sccache: 'yolomode-sccache'
} as const;

export const BANNER = `             _                           _      
            | |                         | |     
 _   _  ___ | | ___  _ __ ___   ___   __| | ___ 
| | | |/ _ \\| |/ _ \\| '_ \` _ \\ / _ \\ / _\` |/ _ \\
| |_| | (_) | | (_) | | | | | | (_) | (_| |  __/
 \\__, |\\___/|_|\\___/|_| |_| |_|\\___/ \\__,_|\\___|
  __/ |                                         
 |___/                                          
`;

export const ADJECTIVES = [
  'bold',
  'brave',
  'calm',
  'cool',
  'deft',
  'fast',
  'keen',
  'fond',
  'mild',
  'sharp',
  'slim',
  'snug',
  'warm',
  'wild',
  'wise',
  'swift',
  'quiet',
  'grand',
  'stark',
  'vivid'
];

export const ANIMALS = [
  'fox',
  'owl',
  'elk',
  'yak',
  'emu',
  'ape',
  'ram',
  'cod',
  'jay',
  'bee',
  'ant',
  'bat',
  'cat',
  'dog',
  'hen',
  'rat',
  'pig',
  'cow',
  'bug',
  'wren'
];
