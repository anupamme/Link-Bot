let closeMenu = null;

export function closeLocalizationMenu() {
  closeMenu?.();
}

// Keep native selects as the source of values and change events. Enhance only
// this cabinet editor so its popup can share the configured card material.
export function mountLocalizationSelects(root) {
  for (const select of root.querySelectorAll('.admin-localization select')) {
    if (select.hidden) continue;
    const label = select.closest('label');
    const field = document.createElement('div');
    field.className = label.className;
    field.append(...label.childNodes);
    label.replaceWith(field);
    select.hidden = true;
    const key = select.dataset.settingPath.replaceAll('.', '-');
    const caption = field.querySelector('span');
    caption.id = `${key}-label`;
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'admin-localization-select';
    trigger.dataset.localizationControl = select.dataset.settingPath;
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-labelledby', caption.id);
    trigger.setAttribute('aria-controls', `${key}-menu`);
    trigger.textContent = select.selectedOptions[0]?.textContent || '';
    field.append(trigger);

    function open() {
      closeLocalizationMenu();
      const controller = new AbortController();
      const menu = document.createElement('div');
      menu.className = 'admin-localization-menu';
      menu.id = `${key}-menu`;
      menu.setAttribute('role', 'listbox');
      menu.setAttribute('aria-labelledby', caption.id);
      const items = [...select.options].map(option => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'admin-localization-menu__option';
        item.setAttribute('role', 'option');
        item.setAttribute('aria-label', option.textContent);
        item.setAttribute('aria-selected', String(option.selected));
        item.tabIndex = -1;
        item.textContent = option.textContent;
        item.disabled = option.disabled;
        item.addEventListener('click', () => {
          select.value = option.value;
          trigger.textContent = option.textContent;
          closeMenu(true);
          select.dispatchEvent(new Event('input', { bubbles: true }));
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        menu.append(item);
        return item;
      });
      const close = (restoreFocus = false) => {
        controller.abort();
        menu.remove();
        trigger.setAttribute('aria-expanded', 'false');
        closeMenu = null;
        if (restoreFocus && trigger.isConnected) trigger.focus({ preventScroll: true });
      };
      closeMenu = close;
      document.body.append(menu);
      const rect = trigger.getBoundingClientRect();
      menu.style.width = `${Math.min(rect.width, window.innerWidth - 24)}px`;
      menu.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - rect.width - 12))}px`;
      const below = window.innerHeight - rect.bottom - 16;
      const above = rect.top - 16;
      const down = below >= Math.min(menu.scrollHeight, 240) || below >= above;
      menu.style.maxHeight = `${Math.max(44, Math.min(280, down ? below : above))}px`;
      if (down) menu.style.top = `${rect.bottom + 6}px`;
      else menu.style.bottom = `${window.innerHeight - rect.top + 6}px`;
      trigger.setAttribute('aria-expanded', 'true');
      const options = items.filter(item => !item.disabled);
      const focus = index => options[(index + options.length) % options.length]?.focus({ preventScroll: true });
      focus(Math.max(0, options.indexOf(items[select.selectedIndex])));
      let search = '', typedAt = 0;
      menu.addEventListener('keydown', event => {
        const index = options.indexOf(document.activeElement);
        if (event.key === 'Escape') { event.preventDefault(); close(true); }
        else if (event.key === 'Tab') { trigger.focus(); close(); }
        else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          focus(event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : index + (event.key === 'ArrowDown' ? 1 : -1));
          document.activeElement?.scrollIntoView({ block: 'nearest' });
        } else if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          search = (Date.now() - typedAt > 700 ? '' : search) + event.key.toLocaleLowerCase();
          typedAt = Date.now();
          const match = options.findIndex(item => item.textContent.toLocaleLowerCase().startsWith(search));
          if (match >= 0) focus(match);
        }
      });
      document.addEventListener('pointerdown', event => {
        if (!menu.contains(event.target) && !trigger.contains(event.target)) close();
      }, { signal: controller.signal });
      window.addEventListener('resize', () => close(), { signal: controller.signal });
      document.addEventListener('scroll', event => {
        if (!menu.contains(event.target)) close();
      }, { capture: true, signal: controller.signal });
    }
    trigger.addEventListener('click', () => trigger.getAttribute('aria-expanded') === 'true' ? closeMenu(true) : open());
    trigger.addEventListener('keydown', event => {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); open(); }
    });
  }
}
