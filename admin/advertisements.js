// LEOGO DIGITAL MARKET — Advertisement Management
// Kept separate from admin.js so an advertisement feature error can never block the core Admin portal.
(() => {
  'use strict';

  const db = window.leogoAdminDb;
  if (!db) return;

  const $ = (selector, root=document) => root.querySelector(selector);
  const $$ = (selector, root=document) => root ? Array.from(root.querySelectorAll(selector)) : [];
  const state = { advertisements: [], requests: [] };
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

  const isVideoAdvert = (path='') => /\.(mp4|webm)(?:[?#]|$)/i.test(String(path));
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
    const video = file ? ['video/mp4','video/webm'].includes(file.type) : isVideoAdvert(path);
    box.innerHTML = url
      ? (video ? '<video src="'+escapeHtml(url)+'" controls playsinline preload="metadata" style="max-width:100%;max-height:250px"></video>' : '<img src="'+escapeHtml(url)+'" alt="Advertisement poster preview" loading="lazy" decoding="async">')
      : '<span>📣</span><small>No advert media selected</small>';
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
    $('#advertisementPopupOnEntry').checked = false;
    $('#advertisementPopupAutoClose5s').checked = false;
    $('#advertisementEditorTitle').textContent = 'Create Advertisement';
    renderPosterPreview();
    window.leogoAdvertEventEditor?.reset();
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
        ? (isVideoAdvert(item.poster_path) ? '<span>🎬 Short video</span>' : '<img class="advert-admin-thumb" src="'+escapeHtml(publicUrl(item.poster_path))+'" alt="" loading="lazy" decoding="async">')
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
        '<td><span class="advert-state '+escapeHtml(runtime)+'">'+escapeHtml(runtime.replace('_',' '))+'</span><small>Saved as '+escapeHtml(item.status)+'</small>'+(item.popup_on_entry?'<span class="advert-popup-badge">📣 Website pop-up ON</span>':'')+(Number(item.popup_auto_close_seconds||0)===5?'<span class="advert-popup-badge">⏱ Auto-close 5s</span>':'')+'</td>'+
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
    await window.leogoAdvertEventEditor?.loadConfigs?.();
    render();
  };

  window.leogoRefreshAdvertisements = load;

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
    $('#advertisementPopupOnEntry').checked = Boolean(item.popup_on_entry);
    $('#advertisementPopupAutoClose5s').checked = Number(item.popup_auto_close_seconds||0)===5;
    $('#advertisementBodyEditor').innerHTML = sanitizeHtml(item.body_html || '');
    $('#advertisementEditorTitle').textContent = 'Edit Advertisement';
    renderPosterPreview(item.poster_path || '');
    window.leogoAdvertEventEditor?.edit(item.id);
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
        if (!['image/jpeg','image/png','image/webp','video/mp4','video/webm'].includes(file.type)) {
          setStatus('Media must be JPG, PNG, WebP, MP4 or WebM.','error');
          return;
        }
        const maxSize = file.type.startsWith('video/') ? 20*1024*1024 : 8*1024*1024;
        if (file.size > maxSize) {
          setStatus(file.type.startsWith('video/') ? 'Short video must be 20 MB or smaller.' : 'Poster must be 8 MB or smaller.','error');
          return;
        }
        if (file.type.startsWith('video/')) {
          const validDuration = await new Promise((resolve) => {
            const media = document.createElement('video');
            const url = URL.createObjectURL(file);
            let finished = false;
            const finish = (ok) => {
              if (finished) return;
              finished = true;
              clearTimeout(timeout);
              media.removeAttribute('src');
              media.load();
              URL.revokeObjectURL(url);
              resolve(ok);
            };
            const timeout = setTimeout(() => finish(false), 8000);
            media.preload = 'metadata';
            media.onloadedmetadata = () => finish(Number.isFinite(media.duration) && media.duration > 0 && media.duration <= 60);
            media.onerror = () => finish(false);
            media.src = url;
          });
          if (!validDuration) {
            setStatus('Short video must be playable and no longer than 60 seconds.','error');
            return;
          }
        }
        let uploadFile = file;
        if (file.type.startsWith('video/')) {
          if (!window.leogoCompressAdvertVideo) {
            setStatus('Video optimizer unavailable. Refresh the Admin page and try again.','error');
            return;
          }
          setStatus('Optimizing video for mobile playback. Keep this page open until complete.');
          try {
            uploadFile = await window.leogoCompressAdvertVideo(file, (percentage) => {
              setStatus('Optimizing video: ' + percentage + '%. Keep this page open.');
            });
          } catch (error) {
            setStatus(friendlyError(error), 'error');
            return;
          }
        }
        const ext = (String(uploadFile.name || 'poster.jpg').split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g,'') || 'jpg';
        const random = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
        uploadedPath = String((await db.auth.getUser()).data?.user?.id || 'admin')+'/'+Date.now()+'-'+random+'.'+ext;
        setStatus('Uploading ' + (uploadFile.size / 1048576).toFixed(1) + ' MB advertisement media…');
        const upload = await db.storage.from('advertisement-media').upload(uploadedPath,uploadFile,{
          cacheControl:'31536000',upsert:false,contentType:uploadFile.type
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
      if ($('#advertisementPopupOnEntry')?.checked && !posterPath) {
        if (uploadedPath) await db.storage.from('advertisement-media').remove([uploadedPath]).catch(() => {});
        setStatus('Upload an image or short video before turning on website pop-up push.','error');
        return;
      }

      const payload = {
        title: $('#advertisementTitle').value.trim(),
        body_html: bodyHtml,
        poster_path: posterPath || null,
        starts_at: startDate.toISOString(),
        ends_at: endDate.toISOString(),
        status: $('#advertisementStatus').value,
        popup_on_entry: Boolean($('#advertisementPopupOnEntry')?.checked),
        popup_auto_close_seconds: $('#advertisementPopupAutoClose5s')?.checked ? 5 : 0
      };

      let eventConfig;
      try { eventConfig=window.leogoAdvertEventEditor?.getConfig?.()||{}; }
      catch(e){setStatus(e.message,'error');return;}
      const { data:savedAdvertisement, error } = await db.rpc('admin_save_advertisement',{
        p_advertisement_id:id,
        p_advertisement:payload
      });

      if (error) {
        if (uploadedPath) await db.storage.from('advertisement-media').remove([uploadedPath]).catch(() => {});
        setStatus(friendlyError(error),'error');
        return;
      }

      const savedId=savedAdvertisement?.id||id;
      if(savedId)$('#advertisementId').value=savedId;
      if(savedId){
        const eventResult=await db.rpc('admin_save_advert_event_actions',{
          p_advertisement_id:savedId,p_config:eventConfig
        });
        if(eventResult.error){
          setStatus('Advertisement saved, but event settings could not save: '+friendlyError(eventResult.error)+'. Please retry before advertising this event.','error');
          return;
        }
        await window.leogoAdvertEventEditor?.loadConfigs?.();
      }

      if (oldPoster && oldPoster !== posterPath) {
        await db.storage.from('advertisement-media').remove([oldPoster]).catch(() => {});
      }

      resetForm();
      await load();
      globalStatus(payload.popup_on_entry
        ? (payload.popup_auto_close_seconds===5
          ? 'Advertisement saved. Website image pop-up will close after 5 seconds; videos stay open for playback.'
          : 'Advertisement saved. Website pop-up push is ON for the live advertising period.')
        : 'Advertisement saved. The Customer Front will follow the publishing period automatically.');
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


  const renderRequests = () => {
    const list = $('#advertisementRequestList');
    if (!list) return;
    if (!state.requests.length) {
      list.innerHTML = '<div class="customer-empty-state compact"><span>📨</span><h4>No advertisement requests yet</h4><p>New customer requests will appear here for Admin review.</p></div>';
      return;
    }
    list.innerHTML = state.requests.map((item) => {
      const statuses = ['pending','in_review','contacted','approved','rejected'];
      const options = statuses.map((status) => '<option value="'+status+'"'+(item.status===status?' selected':'')+'>'+status.replace('_',' ')+'</option>').join('');
      return '<article class="advert-request-review-card" data-ad-request-card="'+escapeHtml(item.id)+'">'+
        '<header><div><strong>'+escapeHtml(item.requester_name)+'</strong><small>'+escapeHtml(formatDate(item.created_at))+'</small></div><span>'+escapeHtml(item.status.replace('_',' '))+'</span></header>'+
        '<div class="advert-request-review-contact"><a href="tel:'+escapeHtml(item.requester_phone)+'">'+escapeHtml(item.requester_phone)+'</a></div>'+
        '<p>'+escapeHtml(item.request_details)+'</p>'+
        '<label><span>Review status</span><select data-ad-request-status>'+options+'</select></label>'+
        '<label><span>Admin notes</span><textarea data-ad-request-notes rows="2" maxlength="1000" placeholder="Private review notes">'+escapeHtml(item.admin_notes||'')+'</textarea></label>'+
        '<button class="secondary-button" type="button" data-ad-request-save="'+escapeHtml(item.id)+'">Save Review</button>'+
      '</article>';
    }).join('');
  };

  const loadRequests = async () => {
    const list = $('#advertisementRequestList');
    if (list) list.innerHTML = '<div class="empty-mini">Loading customer advertisement requests…</div>';
    const { data, error } = await db.rpc('admin_list_advertisement_requests');
    if (error) {
      if (list) list.innerHTML = '<div class="customer-empty-state compact"><span>⚠️</span><h4>Advertisement requests could not load</h4><p>Use Refresh to try again.</p></div>';
      throw error;
    }
    state.requests = Array.isArray(data) ? data : [];
    renderRequests();
  };

  const saveRequestReview = async (button) => {
    const card = button.closest('[data-ad-request-card]');
    if (!card) return;
    await withButtonLock(button,'Saving…',async() => {
      const { error } = await db.rpc('admin_update_advertisement_request',{
        p_request_id:card.dataset.adRequestCard,
        p_status:card.querySelector('[data-ad-request-status]')?.value||'pending',
        p_admin_notes:card.querySelector('[data-ad-request-notes]')?.value||null
      });
      if (error) {
        globalStatus(friendlyError(error),'error');
        return;
      }
      await loadRequests();
      globalStatus('Advertisement request review saved.');
    });
  };

  window.leogoRefreshAdvertisementRequests = loadRequests;

  const bind = () => {
    if (!$('#advertisementForm')) return;
    resetForm();

    $('#refreshAdvertisements')?.addEventListener('click', (event) =>
      withButtonLock(event.currentTarget,'Refreshing…',async()=>{await load();await loadRequests();}).catch((error) => globalStatus(friendlyError(error),'error'))
    );
    $('#refreshAdvertisementRequests')?.addEventListener('click', (event) =>
      withButtonLock(event.currentTarget,'Refreshing…',loadRequests).catch((error) => globalStatus(friendlyError(error),'error'))
    );
    $('#newAdvertisement')?.addEventListener('click',resetForm);
    $('#cancelAdvertisementEdit')?.addEventListener('click',resetForm);
    $('#advertisementForm')?.addEventListener('submit',save);

    $('#advertisementPopupOnEntry')?.addEventListener('change',(event) => {
      if (!event.currentTarget.checked && $('#advertisementPopupAutoClose5s')) {
        $('#advertisementPopupAutoClose5s').checked = false;
      }
    });
    $('#advertisementPopupAutoClose5s')?.addEventListener('change',(event) => {
      if (event.currentTarget.checked && $('#advertisementPopupOnEntry')) {
        $('#advertisementPopupOnEntry').checked = true;
      }
    });

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

    $('#advertisementRequestList')?.addEventListener('click',(event) => {
      const saveButton = event.target.closest?.('[data-ad-request-save]');
      if (saveButton) saveRequestReview(saveButton).catch((error) => globalStatus(friendlyError(error),'error'));
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

    loadRequests().catch((error) => globalStatus(friendlyError(error),'error'));

    document.querySelectorAll('[data-admin-view="advertisements"]').forEach((button) => {
      button.addEventListener('click',() => {
        window.setTimeout(() => {
          load().catch((error) => globalStatus(friendlyError(error),'error'));
          loadRequests().catch((error) => globalStatus(friendlyError(error),'error'));
        },50);
      });
    });
  };

  document.addEventListener('DOMContentLoaded',bind);
})();
