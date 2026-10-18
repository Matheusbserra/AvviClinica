// Older scenarios use stable permission names. The menu now exposes these names
// inside accordion groups, while the underlying permissions remain unchanged.
export function navigationButton(page, name) {
  const visibleName = name === 'Receitas' ? 'Movimentações' : name === 'Relatórios' ? 'Rankings' : name === 'Cadastro de Procedimentos' ? 'Cadastro de Produtos' : name;
  const locator = page.getByRole('button', {name:visibleName,exact:true}).filter({visible:true}).first();
  return new Proxy(locator, {get(target, property) {
    if (property === 'click' || property === 'waitFor') return async (...args) => {
      const names = ['Agenda','Estoque','Follow Up','Anamnese','Ultraformer MPT','Rankings','Relatório Profissional','Estratégias','Dashboard','Movimentações','Lançamento de Procedimentos','Pagamento Profissional','Recibos de Pagamento','Nota Fiscal','Custos','Cadastro de Produtos','Cadastro de Serviços','Cadastro de Profissionais','Cadastro de Pacientes','Metas','Contas'];
      const mobileMenu = page.getByRole('combobox',{name:'Navegar pelo sistema',exact:true});
      if (names.includes(visibleName) && (page.viewportSize()?.width ?? 1440) < 1024) {
        await mobileMenu.waitFor({state:'visible'});
        if (property === 'click') return mobileMenu.selectOption({label:visibleName});
        return mobileMenu.waitFor(...args);
      }
      if (names.includes(visibleName) && (page.viewportSize()?.width ?? 1440) >= 1024) await page.getByRole('navigation',{name:'Menu principal'}).waitFor();
      const item = page.getByRole('navigation',{name:'Menu principal'}).getByRole('button',{name:visibleName,exact:true,includeHidden:true}).first();
      if ((page.viewportSize()?.width ?? 1440) >= 1024 && await item.count() && !await item.isVisible()) await item.locator('xpath=ancestor::section[1]').locator('button[aria-controls^="sidebar-"]').click();
      return target[property](...args);
    };
    const value = target[property]; return typeof value === 'function' ? value.bind(target) : value;
  }});
}
