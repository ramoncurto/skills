import { renameSync, rmSync, writeFileSync } from 'node:fs';
export function atomicJson(path, value) { const temp = `${path}.${process.pid}.tmp`; try { writeFileSync(temp, JSON.stringify(value, null, 2)); renameSync(temp, path); } catch (error) { rmSync(temp, { force: true }); throw error; } }
