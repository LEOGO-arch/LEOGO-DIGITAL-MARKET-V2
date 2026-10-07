// LEOGO DIGITAL MARKET — Customer Order Email Notifications
// Isolated from admin.js so email configuration cannot block the core Admin Control Center.
(() => {
  'use strict';

  const db = window.leogoAdminDb;
  if (!db) return;

  const $ = (selector, root=document) => root.querySelector(selector);

  const setStatus = (node, message='', type='') => {
    if (!node) return;
    node.textContent = message;
    node.className = 'form-status' + (type ? ' ' + type : '');
  };

  const friendlyError = (error) => {
    const message = String(error?.message || error?.details || error || 'Something went wrong.');
    if (/admin access required/i.test(message)) return 'This Admin account cannot manage email notification settings.';
    if (/failed to fetch|network/i.test(message)) return 'Connection failed. Check the internet connection and try again.';
    return message.replace(/^Error:\s*/i,'');
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

  const renderSettings = (settings={}) => {
    const form = $('#emailNotificationSettingsForm');
    if (!form) return;

    form.elements.sender_name.value = settings.sender_name || 'LEOGO DIGITAL MARKET';
    form.elements.sender_email.value = settings.sender_email || '';
    form.elements.app_password.value = '';
    form.elements.enabled.checked = Boolean(settings.enabled);

    $('#emailPendingCount').textContent = Number(settings.pending_count || 0);
    $('#emailSentCount').textContent = Number(settings.sent_count || 0);
    $('#emailFailedCount').textContent = Number(settings.failed_count || 0);

    const configured = Boolean(settings.app_password_configured);
    const active = Boolean(settings.enabled && configured && settings.sender_email);
    $('#emailConfigState').textContent = active
      ? 'Active'
      : configured
        ? 'Configured / Off'
        : 'Needs Gmail App Password';
    $('#emailConfigNote').textContent = active
      ? 'Automatic order lifecycle and Pickup Station emails are enabled'
      : configured
        ? 'Sender is configured but automatic emails are disabled'
        : 'Save a Gmail App Password securely to activate sending';
  };

  const loadSettings = async () => {
    const { data, error } = await db.rpc('admin_get_email_notification_settings');
    if (error) throw error;
    renderSettings(data || {});
    return data || {};
  };

  const saveSettings = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = event.submitter || $('button[type="submit"]', form);

    await withButtonLock(button,'Saving…',async()=>{
      const senderEmail = form.elements.sender_email.value.trim();
      const senderName = form.elements.sender_name.value.trim();
      const appPassword = form.elements.app_password.value.trim();
      const enabled = form.elements.enabled.checked;

      const { data, error } = await db.rpc('admin_save_email_notification_settings',{
        p_enabled: enabled,
        p_sender_name: senderName,
        p_sender_email: senderEmail,
        p_app_password: appPassword || null
      });

      if (error) {
        setStatus($('#emailNotificationSettingsStatus'),friendlyError(error),'error');
        return;
      }

      renderSettings(data || {});
      setStatus(
        $('#emailNotificationSettingsStatus'),
        data?.enabled
          ? 'Customer email notifications are enabled. Order-created, shipped, delivered and Pickup Station events will send automatically.'
          : 'Email sender settings saved. Automatic customer emails are currently switched off.',
        'success'
      );
    });
  };

  const sendTest = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = event.submitter || $('button[type="submit"]',form);
    const recipient = form.elements.recipient_email.value.trim();

    await withButtonLock(button,'Queuing…',async()=>{
      const { error } = await db.rpc('admin_queue_email_test',{p_recipient_email:recipient});
      if (error) {
        setStatus($('#emailNotificationTestStatus'),friendlyError(error),'error');
        return;
      }
      setStatus($('#emailNotificationTestStatus'),'Test email queued. It should arrive shortly if the Gmail App Password and sender account are valid.','success');
      window.setTimeout(()=>loadSettings().catch(()=>{}),2500);
    });
  };

  const bind = () => {
    const settingsForm = $('#emailNotificationSettingsForm');
    const testForm = $('#emailNotificationTestForm');
    if (!settingsForm || !testForm) return;

    settingsForm.addEventListener('submit',saveSettings);
    testForm.addEventListener('submit',sendTest);

    document.querySelectorAll('#settingsTabs [data-settings-panel="email"]').forEach((button)=>{
      button.addEventListener('click',()=>{
        window.setTimeout(()=>{
          loadSettings().catch((error)=>{
            setStatus($('#emailNotificationSettingsStatus'),'Email settings could not load: '+friendlyError(error),'error');
          });
        },80);
      });
    });

    window.setTimeout(()=>{
      db.auth.getSession().then(({data})=>{
        if (data?.session) loadSettings().catch(()=>{});
      }).catch(()=>{});
    },900);
  };

  document.addEventListener('DOMContentLoaded',bind);
})();