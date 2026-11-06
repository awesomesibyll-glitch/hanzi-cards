const marker = 'hanzi-cards-sync-v1.txt';
const prefix = 'hanzi-cards-device-';
const deviceFile = new RegExp(`^${prefix}[a-f0-9-]{36}\\.json$`);
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const maxFile = 8_000_000;
function base64(bytes) {
  const input = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < input.length; i += 16384) binary += String.fromCharCode(...input.subarray(i, i + 16384));
  return btoa(binary);
}
const unbase64 = text => Uint8Array.from(atob(text), character => character.charCodeAt(0));

async function deriveKey(password, salt) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {name:'PBKDF2', hash:'SHA-256', salt, iterations:600000},
    material, {name:'AES-GCM', length:256}, false, ['encrypt', 'decrypt']
  );
}

async function seal(data, key, name) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const compressed = new Blob([JSON.stringify(data)]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = await new Response(compressed).arrayBuffer();
  const encrypted = await crypto.subtle.encrypt({name:'AES-GCM', iv, additionalData:encoder.encode(name)}, key, bytes);
  const result = JSON.stringify({iv:base64(iv), data:base64(encrypted)});
  if (result.length > maxFile) throw new Error('This device has reached the sync size limit. Export a local backup.');
  return result;
}

async function unseal(content, key, name) {
  if (typeof content !== 'string' || content.length > maxFile) throw new Error('Invalid sync file size.');
  let compressed;
  try {
    const {iv, data} = JSON.parse(content);
    compressed = await crypto.subtle.decrypt({name:'AES-GCM', iv:unbase64(iv), additionalData:encoder.encode(name)}, key, unbase64(data));
  } catch {
    throw new Error('The sync password is incorrect or the encrypted backup was changed.');
  }
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.getReader();
  let size = 0;
  let json = '';
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 32_000_000) {
      await reader.cancel();
      throw new Error('The unpacked sync file is too large.');
    }
    json += decoder.decode(value, {stream:true});
  }
  return JSON.parse(json + decoder.decode());
}

async function github(path, token, method = 'GET', body) {
  const response = await fetch('https://api.github.com/gists' + path, {
    method, redirect:'error', cache:'no-store', credentials:'omit',
    signal:AbortSignal.timeout(45000),
    headers:{
      Accept:'application/vnd.github+json', Authorization:'Bearer ' + token,
      'X-GitHub-Api-Version':'2022-11-28', ...(body && {'Content-Type':'application/json'})
    },
    body:body && JSON.stringify(body)
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error('GitHub rejected this token. Check whether it has expired.');
    if (response.status === 403) throw new Error('GitHub denied access. Check Gists permission and try again later.');
    if (response.status === 404) throw new Error('Gist not found. Check the sync ID and GitHub account.');
    throw new Error(`GitHub returned error ${response.status}. Try again later.`);
  }
  return response.json();
}

async function fileContent(file) {
  if (!file.truncated) return file.content;
  if (file.size > maxFile) throw new Error('The encrypted sync file is too large.');
  const url = new URL(file.raw_url);
  if (url.origin !== 'https://gist.githubusercontent.com') throw new Error('Invalid sync file URL.');
  const response = await fetch(url, {credentials:'omit', redirect:'error', referrerPolicy:'no-referrer', signal:AbortSignal.timeout(45000)});
  if (!response.ok) throw new Error('Could not download the encrypted sync file.');
  return response.text();
}

export async function syncGitHub({token, password, id, device, local, merge}) {
  if (!/^[a-f0-9-]{36}$/.test(device)) throw new Error('This device has no sync identifier.');
  if (id && !/^[a-f0-9]{20,40}$/.test(id)) throw new Error('Enter the sync ID shown on your first device.');
  if (!token || password.length < 12) throw new Error('Enter a GitHub token and a sync password of at least 12 characters.');
  const name = prefix + device + '.json';
  if (!id) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(password, salt);
    const content = await seal(await local(), key, name);
    const gist = await github('', token, 'POST', {
      description:'Hanzi Cards encrypted study sync', public:false,
      files:{[marker]:{content:base64(salt)}, [name]:{content}}
    });
    return gist.id;
  }

  const gist = await github('/' + id, token);
  const salt = unbase64(gist.files?.[marker]?.content ?? '');
  const files = Object.entries(gist.files ?? {}).filter(([filename]) => deviceFile.test(filename));
  if (gist.public !== false || salt.length !== 16 || !files.length) throw new Error('This ID is not a secret Hanzi Cards sync Gist.');
  const key = await deriveKey(password, salt);
  const incoming = [];
  let previous;
  for (const [filename, file] of files) {
    const data = await unseal(await fileContent(file), key, filename);
    incoming.push(data);
    if (filename === name) previous = data;
  }
  const data = await local();
  // Each device writes a separate file, so another device's upload is preserved.
  if (JSON.stringify(data) !== JSON.stringify(previous)) {
    const content = await seal(data, key, name);
    await github('/' + id, token, 'PATCH', {files:{[name]:{content}}});
  }
  await merge(incoming);
  return id;
}
