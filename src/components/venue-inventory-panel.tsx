"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { PencilLine, PlusSquare, Trash2, X } from "lucide-react";
import { addVenueTableOptionAction, deleteVenueTableOptionAction } from "@/app/venues/actions";

type TableOptionCard = {
  id: string;
  name: string;
  quantity: number;
  description: string;
  minSpendCents: number;
  depositAmountCents: number;
  capacityMin: number;
  capacityMax: number;
};

type InventoryDraft = {
  tableOptionId: string;
  name: string;
  quantity: string;
  minSpendDollars: string;
  depositDollars: string;
  capacityMin: string;
  capacityMax: string;
  description: string;
};

const emptyDraft: InventoryDraft = {
  tableOptionId: "",
  name: "",
  quantity: "1",
  minSpendDollars: "",
  depositDollars: "",
  capacityMin: "1",
  capacityMax: "",
  description: "",
};

function dollarsFromCents(value: number) {
  return value ? String(Math.round(value / 100)) : "";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value / 100);
}

function draftFromTableOption(option: TableOptionCard): InventoryDraft {
  return {
    tableOptionId: option.id,
    name: option.name,
    quantity: String(option.quantity),
    minSpendDollars: dollarsFromCents(option.minSpendCents),
    depositDollars: dollarsFromCents(option.depositAmountCents),
    capacityMin: String(option.capacityMin),
    capacityMax: String(option.capacityMax),
    description: option.description,
  };
}

export function VenueInventoryPanel({
  slug,
  tableOptions,
  error,
}: {
  slug: string;
  tableOptions: TableOptionCard[];
  error?: string;
}) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [draft, setDraft] = useState<InventoryDraft>(emptyDraft);

  function openCreateDrawer() {
    setDrawerMode("create");
    setIsDrawerOpen(true);
  }

  function openEditDrawer(option: TableOptionCard) {
    setDrawerMode("edit");
    setDraft(draftFromTableOption(option));
    setIsDrawerOpen(true);
  }

  function closeDrawer() {
    setIsDrawerOpen(false);
  }

  function handleDraftChange(field: keyof InventoryDraft, value: string) {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleDeleteSubmit(event: FormEvent<HTMLFormElement>) {
    const confirmed = window.confirm("Delete this table option?");
    if (!confirmed) {
      event.preventDefault();
    }
  }

  return (
    <>
      <article className="panel">
        <div className="panel-header">
          <div>
            <span className="panel-label">Inventory</span>
            <h2>Table options</h2>
          </div>
          <button type="button" className="button button-primary" onClick={openCreateDrawer}>
            <PlusSquare size={16} />
            <span>Create table option</span>
          </button>
        </div>

        <div className="venue-stack">
          {tableOptions.length === 0 ? (
            <article className="venue-card">
              <h3>No table options yet</h3>
              <p>Add your first table type to define inventory, pricing, and guest capacity.</p>
            </article>
          ) : (
            tableOptions.map((tableOption) => (
              <article key={tableOption.id} className="venue-card">
                <div className="venue-card-topline">
                  <div>
                    <h3>{tableOption.name}</h3>
                    <p>{tableOption.quantity} available</p>
                  </div>
                  <div className="inline-form">
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => openEditDrawer(tableOption)}
                    >
                      <PencilLine size={16} />
                      <span>Edit</span>
                    </button>
                    <form action={deleteVenueTableOptionAction} onSubmit={handleDeleteSubmit}>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="tableOptionId" value={tableOption.id} />
                      <button type="submit" className="button button-secondary">
                        <Trash2 size={16} />
                        <span>Delete</span>
                      </button>
                    </form>
                  </div>
                </div>

                <p>{tableOption.description}</p>

                <div className="mini-stats">
                  <span>Min spend {formatCurrency(tableOption.minSpendCents)}</span>
                  <span>Deposit {formatCurrency(tableOption.depositAmountCents)}</span>
                  <span>
                    {tableOption.capacityMin}-{tableOption.capacityMax} guests
                  </span>
                </div>
              </article>
            ))
          )}
        </div>
      </article>

      <div
        className={`drawer-scrim ${isDrawerOpen ? "" : "drawer-scrim-hidden"}`}
        role="presentation"
        onClick={closeDrawer}
      >
        <aside
          className={`drawer-panel ${isDrawerOpen ? "" : "drawer-panel-hidden"}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="table-option-drawer-title"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="panel-header">
            <div>
              <span className="panel-label">Inventory</span>
              <h2 id="table-option-drawer-title">
                {drawerMode === "edit" ? "Edit table option" : "Add table option"}
              </h2>
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={closeDrawer}
              aria-label="Close table option drawer"
            >
              <X size={16} />
            </button>
          </div>

          <form action={addVenueTableOptionAction} className="entity-form">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="tableOptionId" value={draft.tableOptionId} />

            <div className="form-grid">
              <label className="field field-span-full">
                <span>Table category name</span>
                <input
                  name="name"
                  value={draft.name}
                  onChange={(event) => handleDraftChange("name", event.target.value)}
                  required
                />
              </label>

              <div className="form-row form-row-city">
                <label className="field">
                  <span>Quantity</span>
                  <input
                    name="quantity"
                    type="number"
                    min={1}
                    value={draft.quantity}
                    onChange={(event) => handleDraftChange("quantity", event.target.value)}
                    required
                  />
                </label>

                <label className="field">
                  <span>Min guests</span>
                  <input
                    name="capacityMin"
                    type="number"
                    min={1}
                    value={draft.capacityMin}
                    onChange={(event) => handleDraftChange("capacityMin", event.target.value)}
                    required
                  />
                </label>

                <label className="field">
                  <span>Max guests</span>
                  <input
                    name="capacityMax"
                    type="number"
                    min={1}
                    value={draft.capacityMax}
                    onChange={(event) => handleDraftChange("capacityMax", event.target.value)}
                    required
                  />
                </label>
              </div>

              <div className="form-row form-row-contact">
                <label className="field">
                  <span>Minimum spend</span>
                  <input
                    name="minSpendDollars"
                    type="number"
                    min={0}
                    step="50"
                    value={draft.minSpendDollars}
                    onChange={(event) =>
                      handleDraftChange("minSpendDollars", event.target.value)
                    }
                    required
                  />
                </label>

                <label className="field">
                  <span>Deposit</span>
                  <input
                    name="depositDollars"
                    type="number"
                    min={0}
                    step="25"
                    value={draft.depositDollars}
                    onChange={(event) =>
                      handleDraftChange("depositDollars", event.target.value)
                    }
                    required
                  />
                </label>
              </div>

              <label className="field field-span-full">
                <span>Description</span>
                <textarea
                  name="description"
                  rows={4}
                  value={draft.description}
                  onChange={(event) => handleDraftChange("description", event.target.value)}
                  required
                />
              </label>
            </div>

            <div className="action-row">
              <button type="submit" className="button button-primary action-button">
                {drawerMode === "edit" ? "Save changes" : "Save table option"}
              </button>
            </div>

            {error === "missing-table-fields" ? (
              <p className="form-error">Complete all required table option fields before saving.</p>
            ) : null}
          </form>
        </aside>
      </div>
    </>
  );
}
