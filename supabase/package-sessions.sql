-- Execute uma vez no SQL Editor. Preserva os registros existentes.
-- O gateway valida as permissões antes desta chamada privada. A transação
-- serializa vendas/consumos/estornos para não consumir a última sessão duas vezes.
create or replace function public.avvi_save_package_checkout(p_upserts jsonb, p_removed jsonb)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  v_state jsonb; v_original jsonb; v_grants jsonb := '{}'::jsonb;
  v_row jsonb; v_appt jsonb; v_account jsonb; v_line jsonb; v_use jsonb; v_balance jsonb;
  v_old jsonb; v_new jsonb; v_key text; v_id text; v_purchase text;
  v_gross numeric; v_discount numeric; v_paid numeric; v_quantity numeric; v_months integer;
  v_date date; v_expires date; v_used numeric; v_ids text[];
begin
  if jsonb_typeof(p_upserts) <> 'array' or jsonb_typeof(p_removed) <> 'array'
    or jsonb_array_length(p_upserts) > 5000 or jsonb_array_length(p_removed) > 5000 then
    raise exception 'Requisição de pacotes inválida.' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(172901, 1802026);
  select coalesce(jsonb_object_agg(record_id, data), '{}'::jsonb) into v_state
    from public.avvi_records where entity = 'appointments';
  v_original := v_state;
  for v_row in select value from jsonb_array_elements(p_removed) loop
    if v_row->>'entity' = 'appointments' then
      for v_id in select jsonb_array_elements_text(v_row->'ids') loop v_state := v_state - v_id; end loop;
    end if;
  end loop;
  for v_row in select value from jsonb_array_elements(p_upserts) loop
    if v_row->>'entity' = 'appointments' then v_state := jsonb_set(v_state, array[v_row->>'record_id'], v_row->'data'); end if;
  end loop;

  -- Purchased quantities are immutable snapshots in the paid account, including
  -- legacy package lines. The editable service/package catalogue is not consulted.
  for v_appt in select value from jsonb_each(v_state) loop
    v_account := v_appt->'closedAccount';
    if coalesce((v_appt->>'accountClosed')::boolean, false) and v_account is not null
      and jsonb_typeof(v_account->'procedureLines') = 'array' then
      select coalesce(sum((l->>'quantity')::numeric * (l->>'servicePrice')::numeric), 0),
        coalesce(sum(coalesce((l->>'discount')::numeric, 0)), 0)
        into v_gross, v_discount from jsonb_array_elements(v_account->'procedureLines') l;
      v_discount := coalesce((v_account->>'commercialDiscount')::numeric, v_discount);
      select coalesce(sum((p->>'amount')::numeric), 0) into v_paid
        from jsonb_array_elements(coalesce(v_account->'payments', '[]'::jsonb)) p;
      if round(v_paid, 2) < round(greatest(0, round(v_gross, 2) - v_discount), 2) then continue; end if;
      for v_line in select value from jsonb_array_elements(v_account->'procedureLines') loop
        if coalesce(v_line->>'packageId', '') = '' or coalesce(v_line->>'serviceId', '') = '' then continue; end if;
        v_quantity := (v_line->>'quantity')::numeric;
        if v_quantity < 1 or v_quantity <> trunc(v_quantity) then raise exception 'Quantidade de sessões inválida.' using errcode = 'P0001'; end if;
        v_purchase := coalesce(v_line->>'packagePurchaseKey', 'legacy:' || (v_line->>'packageId'));
        v_key := jsonb_build_array(v_appt->>'id', v_account->>'id', v_purchase, v_line->>'serviceId')::text;
        v_date := (v_account->>'date')::date;
        v_months := coalesce((v_line->>'packageValidityMonths')::integer, 0);
        v_expires := case when v_months > 0 then (v_date + make_interval(months => v_months))::date else null end;
        v_balance := v_grants->v_key;
        v_grants := jsonb_set(v_grants, array[v_key], jsonb_build_object(
          'patientId', v_appt->>'patientId', 'packageId', v_line->>'packageId',
          'sourceAppointmentId', v_appt->>'id', 'purchasedOn', v_date, 'expiresOn', v_expires,
          'total', coalesce((v_balance->>'total')::numeric, 0) + v_quantity, 'used', 0));
      end loop;
    end if;
  end loop;
  for v_appt in select value from jsonb_each(v_state) loop
    if not coalesce((v_appt->>'accountClosed')::boolean, false) then continue; end if;
    v_account := v_appt->'closedAccount';
    if v_account->'packageSessionUses' is null then continue; end if;
    if jsonb_typeof(v_account->'packageSessionUses') <> 'array' or jsonb_array_length(v_account->'packageSessionUses') > 100 then
      raise exception 'Utilização de pacote inválida.' using errcode = 'P0001';
    end if;
    for v_use in select value from jsonb_array_elements(v_account->'packageSessionUses') loop
      v_quantity := (v_use->>'quantity')::numeric;
      if v_quantity is null or v_quantity < 1 or v_quantity > 10000 or v_quantity <> trunc(v_quantity) then
        raise exception 'Quantidade de sessões inválida.' using errcode = 'P0001';
      end if;
      v_key := jsonb_build_array(v_use->>'sourceAppointmentId', v_use->>'sourceAccountId', v_use->>'purchaseKey', v_use->>'serviceId')::text;
      v_balance := v_grants->v_key;
      if v_balance is null or v_balance->>'patientId' is distinct from v_appt->>'patientId'
        or v_balance->>'packageId' is distinct from v_use->>'packageId' then
        raise exception 'O pacote precisa estar pago e pertencer a este paciente. Confira as utilizações vinculadas.' using errcode = 'P0001';
      end if;
      v_date := (v_account->>'date')::date;
      if v_date < (v_balance->>'purchasedOn')::date or v_date > (v_balance->>'expiresOn')::date then
        raise exception 'A sessão está fora da validade do pacote.' using errcode = 'P0001';
      end if;
      v_used := (v_balance->>'used')::numeric + v_quantity;
      if v_used > (v_balance->>'total')::numeric then
        raise exception 'O pacote não possui sessões suficientes. Atualize os dados e confira o saldo.' using errcode = 'P0001';
      end if;
      v_grants := jsonb_set(v_grants, array[v_key, 'used'], to_jsonb(v_used));
    end loop;
  end loop;

  -- A reversal also removes derivatives not visible to a restricted Agenda user.
  for v_old in select value from jsonb_each(v_original) loop
    v_new := v_state->(v_old->>'id');
    if coalesce((v_old->>'accountClosed')::boolean, false) and not coalesce((v_new->>'accountClosed')::boolean, false) then
      v_ids := array[v_old#>>'{closedAccount,id}', v_old->>'financialEntryId', v_old#>>'{closedAccount,generatedEntryId}'];
      delete from public.avvi_records where
        (entity in ('revenues', 'fixed_costs') and data->>'sourceFinancialEntryId' = any(v_ids))
        or (entity = 'financial_entries' and (data->>'sourceAccountId' = any(v_ids) or record_id = any(v_ids)));
    end if;
  end loop;
  for v_row in select value from jsonb_array_elements(p_removed) loop
    delete from public.avvi_records where entity = v_row->>'entity'
      and record_id in (select jsonb_array_elements_text(v_row->'ids'));
  end loop;
  insert into public.avvi_records (entity, record_id, data, updated_at)
    select r->>'entity', r->>'record_id', r->'data', clock_timestamp() from jsonb_array_elements(p_upserts) r
    on conflict (entity, record_id) do update set data = excluded.data, updated_at = excluded.updated_at;
  return jsonb_build_object('saved', true);
end;
$$;
revoke all on function public.avvi_save_package_checkout(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.avvi_save_package_checkout(jsonb, jsonb) to service_role;
