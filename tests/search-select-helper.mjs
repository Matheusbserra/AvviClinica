// Exercise the visible typed search and real option selection, never React state.
export async function selectSearchOption(scope,label,name){
 const input=scope.getByRole('combobox',{name:label,exact:true});
 await input.fill(name);
 if(!name){await input.press('Escape');return;}
 const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 await scope.getByRole('listbox',{name:`Resultados de ${label}`,exact:true}).getByRole('option',{name:new RegExp(`^${escaped}(?: ·|$)`)}).click();
}
