// LEOGO DIGITAL MARKET — Advertisement Management
// Kept separate from admin.js so an advertisement feature error can never block the core Admin portal.
(() => {
  'use strict';

  const db = window.leogoAdminDb;
  if (!db) return;

  const $ = (selector, root=document) => root.querySelector(selector);
  const $$ = (selector, root=document) => root ? Array.from(root.querySelectorAll(selector)) : [];
  const state = { advertisements: [] };
  let posterObjectUrl = '';

  const escapeHtml = (value='') => String(value ?? '').replace(/[&<>'"]/g, (ch) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  })[ch]);

  const friendlyError = (error) => {
    const message = String(error?.message || error?.details || error || 'Something went wrong.');
    if (/admin access required|permission/i.test(message)) return 'This Admin account does not have permission to manage advertisements.';
    if (/failed to fetch|network/i.test(message)) return 'Connection failed. Check your internet and try again.';
    return message.replace(/^Error:\s*/i,'');
  };

  const setStatus = (message='', type='') => {
    const node = $('#advertisementFormStatus');
    if (!node) return;
    node.textContent = message;
    node.className = 'form-status' + (type ? ' ' + type : '');
  };

  const globalStatus = (message='', type='success') => {
    const node = $('#adminGlobalStatus');
    if (!node) return;
    node.textContent = message;
    node.className = 'global-status show ' + type;
    window.setTimeout(() => {
      if (node.textContent === message) {
        node.className = 'global-status';
        node.textContent = '';
      }
    }, 5000);
  };

  const withButtonLock = async (button, label, work) => {
    if (!button) return work();
    const old = button.textContent;
    button.disabled = true;
    button.textContent = label;
    try { return await work(); }
    finally {
      button.disabled = false;
      button.textContent = old;
    }
  };

  const publicUrl = (path) => {
    if (!path) return '';
    return db.storage.from('advertisement-media').getPublicUrl(String(path)).data?.publicUrl || '';
  };

  const localDateTime = (value) => {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2,'0');
    return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate())+'T'+pad(date.getHours())+':'+pad(date.getMinutes());
  };

  const formatDate = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-KE',{
      dateStyle:'medium', timeStyle:'short', timeZone:'Africa/Nairobi'
    }).format(date);
  };

  const sanitizeHtml = (html='') => {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    const allowed = new Set(['B','STRONG','I','EM','U','BR','P','DIV','UL','OL','LI','A']);
    Array.from(template.content.querySelectorAll('*')).forEach((node) => {
      if (!allowed.has(node.tagName)) {
        node.replaceWith(...Array.from(node.childNodes));
        return;
      }
      Array.from(node.attributes).forEach((attr) => {
        if (node.tagName === 'A' && attr.name.toLowerCase() === 'href') {
          const href = String(attr.value || '').trim();
          if (!/^(https?:|mailto:|tel:)/i.test(href)) node.removeAttribute(attr.name);
        } else {
          node.removeAttribute(attr.name);
        }
      });
      if (node.tagName === 'A' && node.getAttribute('href')) {
        node.setAttribute('target','_blank');
        node.setAttribute('rel','noopener noreferrer');
      }
    });
    return template.innerHTML.trim();
  };

  const runtimeState = (item) => {
    const now = Date.now();
    const start = new Date(item.starts_at || 0).getTime();
    const end = new Date(item.ends_at || 0).getTime();
    if (item.status === 'archived') return 'archived';
    if (item.status === 'paused') return 'paused';
    if (item.status === 'draft') return 'draft';
    if (Number.isFinite(end) && end <= now) return 'expired';
    if (Number.isFinite(start) && start > now) return 'scheduled';
    return 'live';
  };

  const renderPosterPreview = (path='', file=null) => {
    const box = $('#advertisementPosterPreview');
    if (!box) return;
    if (posterObjectUrl) {
      URL.revokeObjectURL(posterObjectUrl);
      posterObjectUrl = '';
    }
    let url = path ? publicUrl(path) : '';
    if (file) {
      posterObjectUrl = URL.createObjectURL(file);
      url = posterObjectUrl;
    }
    box.innerHTML = url
      ? '<img src="'+escapeHtml(url)+'" alt="Advertisement poster preview">'
      : '<span>📣</span><small>No poster selected</small>';
  };

  const resetForm = () => {
    const form = $('#advertisementForm');
    if (!form) return;
    form.reset();
    $('#advertisementId').value = '';
    $('#advertisementExistingPoster').value = '';
    $('#advertisementStatus').value = 'draft';
    const start = new Date();
    start.setSeconds(0,0);
    const end = new Date(start.getTime() + 7*24*60*60*1000);
    $('#advertisementStart').value = localDateTime(start);
    $('#advertisementEnd').value = localDateTime(end);
    $('#advertisementBodyEditor').innerHTML = '';
    $('#advertisementRemovePoster').checked = false;
    $('#advertisementEditorTitle').textContent = 'Create Advertisement';
    renderPosterPreview();
    setStatus();
  };

  const render = () => {
    const rows = Array.isArray(state.advertisements) ? state.advertisements : [];
    const counts = { live:0, scheduled:0, draft:0, paused:0, expired:0 };
    rows.forEach((item) => {
      const key = runtimeState(item);
      if (counts[key] != null) counts[key] += 1;
    });

    if ($('#advertLiveCount')) $('#advertLiveCount').textContent = counts.live;
    if ($('#advertScheduledCount')) $('#advertScheduledCount').textContent = counts.scheduled;
    if ($('#advertDraftCount')) $('#advertDraftCount').textContent = counts.draft + counts.paused;
    if ($('#advertExpiredCount')) $('#advertExpiredCount').textContent = counts.expired;

    const body = $('#advertisementTableBody');
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="5">No advertisements created yet.</td></tr>';
      return;
    }

    body.innerHTML = rows.map((item) => {
      const runtime = runtimeState(item);
      const poster = item.poster_path
        ? '<img class="advert-admin-thumb" src="'+escapeHtml(publicUrl(item.poster_path))+'" alt="">'
        : '—';
      const text = (item.body_html || '').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,100) || 'Poster-only advertisement';
      const statusAction = item.status === 'published'
        ? '<button type="button" data-advert-status="paused" data-advert-id="'+escapeHtml(item.id)+'">Pause</button>'
        : item.status === 'archived'
          ? ''
          : '<button type="button" data-advert-status="published" data-advert-id="'+escapeHtml(item.id)+'">Publish</button>';

      return '<tr>'+
        '<td><strong>'+escapeHtml(item.title)+'</strong><small>'+escapeHtml(text)+'</small></td>'+
        '<td>'+escapeHtml(formatDate(item.starts_at))+'<small>to '+escapeHtml(formatDate(item.ends_at))+'</small></td>'+
        '<td><span class="advert-state '+escapeHtml(runtime)+'">'+escapeHtml(runtime.replace('_',' '))+'</span><small>Saved as '+escapeHtml(item.status)+'</small></td>'+
        '<td>'+poster+'</td>'+
        '<td><div class="advert-row-actions"><button type="button" data-advert-edit="'+escapeHtml(item.id)+'">Edit</button>'+statusAction+
          (item.status !== 'archived' ? '<button class="danger" type="button" data-advert-status="archived" data-advert-id="'+escapeHtml(item.id)+'">Archive</button>' : '')+
        '</div></td>'+
      '</tr>';
    }).join('');
  };

  const load = async () => {
    const body = $('#advertisementTableBody');
    if (body) body.innerHTML = '<tr><td colspan="5">Loading advertisements…</td></tr>';
    const { data, error } = await db.rpc('admin_list_advertisements');
    if (error) {
      if (body) body.innerHTML = '<tr><td colspan="5">Advertisements could not load. Use Refresh to try again.</td></tr>';
      throw error;
    }
    state.advertisements = Array.isArray(data) ? data : [];
    render();
  };

  const edit = (id) => {
    const item = state.advertisements.find((row) => row.id === id);
    if (!item) return;
    $('#advertisementId').value = item.id;
    $('#advertisementTitle').value = item.title || '';
    $('#advertisementStart').value = localDateTime(item.starts_at);
    $('#advertisementEnd').value = localDateTime(item.ends_at);
    $('#advertisementStatus').value = item.status === 'archived' ? 'draft' : (item.status || 'draft');
    $('#advertisementExistingPoster').value = item.poster_path || '';
    $('#advertisementRemovePoster').checked = false;
    $('#advertisementBodyEditor').innerHTML = sanitizeHtml(item.body_html || '');
    $('#advertisementEditorTitle').textContent = 'Edit Advertisement';
    renderPosterPreview(item.poster_path || '');
    setStatus();
    $('#advertisementForm')?.scrollIntoView({behavior:'smooth',block:'start'});
  };

  const save = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const button = event.submitter;

    await withButtonLock(button,'Saving…',async() => {
      const id = $('#advertisementId').value || null;
      const oldPoster = $('#advertisementExistingPoster').value || '';
      const removePoster = $('#advertisementRemovePoster').checked;
      const file = $('#advertisementPosterFile').files?.[0] || null;
      const startValue = $('#advertisementStart').value;
      const endValue = $('#advertisementEnd').value;
      const startDate = new Date(startValue);
      const endDate = new Date(endValue);

      if (!startValue || !endValue || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
        setStatus('Advertisement end time must be after the start time.','error');
        return;
      }

      let posterPath = removePoster ? '' : oldPoster;
      let uploadedPath = '';

      if (file) {
        if (!['image/jpeg','image/png','image/webp'].includes(file.type)) {
          setStatus('Poster must be JPG, PNG or WebP.','error');
          return;
        }
        if (file.size > 8*1024*1024) {
          setStatus('Poster must be 8 MB or smaller.','error');
          return;
        }
        const ext = (String(file.name || 'poster.jpg').split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g,'') || 'jpg';
        const random = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
        uploadedPath = String((await db.auth.getUser()).data?.user?.id || 'admin')+'/'+Date.now()+'-'+random+'.'+ext;
        const upload = await db.storage.from('advertisement-media').upload(uploadedPath,file,{
          cacheControl:'3600',upsert:false,contentType:file.type
        });
        if (upload.error) {
          setStatus(friendlyError(upload.error),'error');
          return;
        }
        posterPath = uploadedPath;
      }

      const bodyHtml = sanitizeHtml($('#advertisementBodyEditor').innerHTML);
      if (!bodyHtml && !posterPath) {
        if (uploadedPath) await db.storage.from('advertisement-media').remove([uploadedPath]).catch(() => {});
        setStatus('Add advertisement text or upload a poster.','error');
        return;
      }

      const payload = {
        title: $('#advertisementTitle').value.trim(),
        body_html: bodyHtml,
        poster_path: posterPath || null,
        starts_at: startDate.toISOString(),
        ends_at: endDate.toISOString(),
        status: $('#advertisementStatus').value
      };

      const { error } = await db.rpc('admin_save_advertisement',{
        p_advertisement_id:id,
        p_advertisement:payload
      });

      if (error) {
        if (uploadedPath) await db.storage.from('advertisement-media').remove([uploadedPath]).catch(() => {});
        setStatus(friendlyError(error),'error');
        return;
      }

      if (oldPoster && oldPoster !== posterPath) {
        await db.storage.from('advertisement-media').remove([oldPoster]).catch(() => {});
      }

      resetForm();
      await load();
      globalStatus('Advertisement saved. The Customer Front will follow the publishing period automatically.');
    });
  };

  const setStatusAction = async (id,status,button) => {
    if (status === 'archived' && !window.confirm('Archive this advertisement? It will stop appearing on the Customer Front.')) return;
    await withButtonLock(button,'Saving…',async() => {
      const { error } = await db.rpc('admin_set_advertisement_status',{
        p_advertisement_id:id,
        p_status:status
      });
      if (error) {
        globalStatus(friendlyError(error),'error');
        return;
      }
      await load();
      globalStatus(status === 'published'
        ? 'Advertisement published/scheduled.'
        : status === 'paused'
          ? 'Advertisement paused.'
          : 'Advertisement archived.');
    });
  };

  const bind = () => {
    if (!$('#advertisementForm')) return;
    resetForm();

    $('#refreshAdvertisements')?.addEventListener('click', (event) =>
      withButtonLock(event.currentTarget,'Refreshing…',load).catch((error) => globalStatus(friendlyError(error),'error'))
    );
    $('#newAdvertisement')?.addEventListener('click',resetForm);
    $('#cancelAdvertisementEdit')?.addEventListener('click',resetForm);
    $('#advertisementForm')?.addEventListener('submit',save);

    $('#advertisementPosterFile')?.addEventListener('change',(event) => {
      renderPosterPreview($('#advertisementExistingPoster').value || '',event.currentTarget.files?.[0] || null);
    });
    $('#advertisementRemovePoster')?.addEventListener('change',(event) => {
      renderPosterPreview(event.currentTarget.checked ? '' : ($('#advertisementExistingPoster').value || ''),$('#advertisementPosterFile').files?.[0] || null);
    });

    $$('.advert-rich-toolbar [data-advert-format]').forEach((button) => {
      button.addEventListener('mousedown',(event) => event.preventDefault());
      button.addEventListener('click',() => {
        const command = button.dataset.advertFormat;
        $('#advertisementBodyEditor')?.focus();
        if (command === 'createLink') {
          const href = (window.prompt('Enter a full link, for example https://example.com','https://') || '').trim();
          if (href && /^(https?:|mailto:|tel:)/i.test(href)) document.execCommand('createLink',false,href);
          else if (href) globalStatus('Use a valid http, https, mailto or tel link.','error');
          return;
        }
        document.execCommand(command,false,null);
      });
    });

    $('#advertisementTableBody')?.addEventListener('click',(event) => {
      const editButton = event.target.closest?.('[data-advert-edit]');
      if (editButton) {
        edit(editButton.dataset.advertEdit);
        return;
      }
      const statusButton = event.target.closest?.('[data-advert-status]');
      if (statusButton) {
        setStatusAction(statusButton.dataset.advertId,statusButton.dataset.advertStatus,statusButton)
          .catch((error) => globalStatus(friendlyError(error),'error'));
      }
    });

    document.querySelectorAll('[data-admin-view="advertisements"]').forEach((button) => {
      button.addEventListener('click',() => {
        window.setTimeout(() => load().catch((error) => globalStatus(friendlyError(error),'error')),50);
      });
    });
  };

  document.addEventListener('DOMContentLoaded',bind);
})();