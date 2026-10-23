// @ts-nocheck

export const SAMPLE_PAGES = [
  {title:'Photosynthesis: An Overview', lines:[
    'Photosynthesis is the process by which green plants, algae, and some',
    'bacteria convert light energy into chemical energy stored in glucose.',
    '',
    'The overall reaction can be summarized as:',
    '6 CO2 + 6 H2O + light energy -> C6H12O6 + 6 O2',
    '',
    'This reaction takes place inside chloroplasts, organelles that contain',
    'the green pigment chlorophyll. Chlorophyll absorbs light most strongly',
    'in the blue and red regions of the visible spectrum, which is why',
    'leaves appear green - that color is reflected, not absorbed.',
    '',
    'Photosynthesis occurs in two linked stages: the light-dependent',
    'reactions, which take place in the thylakoid membranes, and the',
    'light-independent reactions (the Calvin cycle), which take place in',
    'the stroma.'
  ]},
  {title:'The Light-Dependent Reactions', lines:[
    'In the light-dependent reactions, sunlight is absorbed by photosystems',
    'embedded in the thylakoid membrane. This energy splits water molecules',
    'in a process called photolysis, releasing oxygen as a byproduct.',
    '',
    'The energy captured is used to produce two energy-carrying molecules:',
    'ATP and NADPH. These molecules power the second stage of photosynthesis.',
    '',
    'Key terms to remember:',
    '  - Photolysis: the splitting of water using light energy',
    '  - Photosystem: a cluster of pigments and proteins that captures light',
    '  - ATP synthase: an enzyme that produces ATP using a proton gradient',
    '',
    'Try selecting the word "Photolysis" above and tapping Explain word.'
  ]},
  {title:'The Calvin Cycle', lines:[
    'The Calvin cycle uses the ATP and NADPH generated in the light-dependent',
    'reactions to convert carbon dioxide into glucose. This process does not',
    'directly require light, which is why it is sometimes called the',
    '"dark reaction," although it usually occurs during daylight hours',
    'alongside the light-dependent reactions.',
    '',
    'The cycle has three main phases: carbon fixation, reduction, and',
    'regeneration of ribulose bisphosphate (RuBP). The enzyme RuBisCO,',
    'often called the most abundant protein on Earth, catalyzes the first',
    'step of carbon fixation.',
    '',
    'Try selecting this whole paragraph and tapping Explain line, or',
    'highlighting a sentence you want to revisit later.'
  ]}
];

export function escapePdfText(s){
  return s.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
}

export function buildSamplePdfBytes(pages){
  const objs = [];
  objs.push({num:1, body:'1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'});
  const kids = pages.map((_,i)=>(4+i*2)+' 0 R').join(' ');
  objs.push({num:2, body:`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`});
  objs.push({num:3, body:'3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'});

  pages.forEach((p,i)=>{
    const pageNum = 4+i*2, contentNum = 5+i*2;
    let y = 740;
    const cmds = [`BT /F1 17 Tf 72 ${y} Td (${escapePdfText(p.title)}) Tj ET`];
    y -= 32;
    for(const line of p.lines){
      cmds.push(`BT /F1 11 Tf 72 ${y} Td (${escapePdfText(line)}) Tj ET`);
      y -= 17;
    }
    const stream = cmds.join('\n')+'\n';
    objs.push({num:pageNum, body:`${pageNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNum} 0 R >>\nendobj\n`});
    objs.push({num:contentNum, body:`${contentNum} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}endstream\nendobj\n`});
  });

  objs.sort((a,b)=>a.num-b.num);
  let out = '%PDF-1.4\n';
  const offsets = {};
  for(const o of objs){ offsets[o.num] = out.length; out += o.body; }
  const xrefOffset = out.length;
  const maxNum = Math.max(...objs.map(o=>o.num));
  let xref = `xref\n0 ${maxNum+1}\n0000000000 65535 f \n`;
  for(let i=1;i<=maxNum;i++){
    xref += (offsets[i]!==undefined? String(offsets[i]).padStart(10,'0'):'0000000000') + ' 00000 n \n';
  }
  out += xref;
  out += `trailer\n<< /Size ${maxNum+1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const bytes = new Uint8Array(out.length);
  for(let i=0;i<out.length;i++) bytes[i] = out.charCodeAt(i) & 0xFF;
  return bytes.buffer;
}

export async function addBookFromBuffer(name, buf, size, extra={}){
  const raw = await window.DB.normalizeBuffer(buf);
  if (!raw) {
    throw new Error('Invalid or empty buffer provided for PDF');
  }

  let doc;
  if (typeof window.loadPdfDocumentSafely === 'function') {
    doc = await window.loadPdfDocumentSafely(raw);
  } else {
    doc = await window.pdfjsLib.getDocument({ data: raw.slice(0), ...(window.PDFJS_LOAD_OPTS || {}) }).promise;
  }

  let thumb = '';
  try {
    const page1 = await doc.getPage(1);
    const vp = page1.getViewport({scale:1});
    const targetWidth = 300 * Math.min(window.devicePixelRatio || 1, 2);
    const scale = targetWidth / (vp.width || 300);
    const thumbVp = page1.getViewport({scale});
    const canvas = document.createElement('canvas');
    canvas.width = thumbVp.width;
    canvas.height = thumbVp.height;
    await page1.render({canvasContext:canvas.getContext('2d'), viewport:thumbVp}).promise;
    thumb = canvas.toDataURL('image/jpeg', 0.85);
  } catch (thumbErr) {
    console.warn('Thumbnail generation skipped:', thumbErr);
  }

  const rec = {
    id: window.uid(),
    name,
    size: size || raw.byteLength,
    pageCount: doc.numPages || 1,
    thumb,
    lastOpened: Date.now(),
    lastPage: 1,
    pinned: false,
    folder: '',
    subject: '',
    createdAt: Date.now(),
    data: raw,
    ...extra
  };
  await window.DB.put('files', rec);
  window.State.files.unshift({...rec, data:undefined});
  return rec;
}

export async function importFiles(fileList){
  window.toast(`Importing ${fileList.length} file${fileList.length>1?'s':''}…`);
  for(const file of fileList){
    try{
      const buf = await file.arrayBuffer();
      await addBookFromBuffer(file.name.replace(/\.pdf$/i,''), buf, file.size, {});
    }catch(err){
      console.error(err);
      window.toast(`Couldn't import ${file.name} — file may be corrupted`);
    }
  }
  window.toast('Import complete');
  window.renderDashboard();
}

export async function seedSampleIfNeeded(){
  const already = await window.DB.getSetting('seededSample_v4', false);
  if(already) return;
  try{
    const existing = window.State.files.filter(f=>f.folder==='Sample');
    for(const f of existing){
      await window.DB.del('files', f.id);
      const annots = await window.DB.byIndex('annotations','fileId',f.id);
      for(const a of annots) await window.DB.del('annotations', a.id);
      await window.DB.del('progress', f.id);
    }
    window.State.files = window.State.files.filter(f=>f.folder!=='Sample');

    const buf = buildSamplePdfBytes(SAMPLE_PAGES);
    await addBookFromBuffer('Photosynthesis: A Study Guide (sample)', buf, buf.byteLength, {subject:'Biology', folder:'Sample'});
    await window.DB.setting('seededSample_v4', true);
    window.toast('Added a sample PDF to try the app');
    window.renderDashboard();
  }catch(err){
    console.warn('Sample PDF seed skipped:', err);
  }
}

// Bind to window for global availability
window.addBookFromBuffer = addBookFromBuffer;
window.importFiles = importFiles;
window.seedSampleIfNeeded = seedSampleIfNeeded;
