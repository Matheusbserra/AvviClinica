export async function selectCalendarDate(page,date,label='Calendário do pós-procedimento') {
 if(label==='Calendário do pós-procedimento'){
  const field=page.getByLabel('Data de referência dos contatos',{exact:true});
  if(await field.count()){await field.fill(date);return;}
 }
 const calendar=page.getByRole('region',{name:label,exact:true});await calendar.waitFor();
 for(let count=0;count<240;count++){
  const current=await calendar.getAttribute('data-selected-date');
  if(current.slice(0,7)===date.slice(0,7)){const [year,month,day]=date.split('-');await calendar.getByRole('button',{name:`Selecionar dia ${day}/${month}/${year}`,exact:true}).click();return;}
  await calendar.getByRole('button',{name:current.slice(0,7)<date.slice(0,7)?'Próximo mês':'Mês anterior',exact:true}).click();
 }
 throw Error('Calendar month navigation did not reach '+date);
}
