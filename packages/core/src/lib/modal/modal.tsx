import React from "react";
import ReactDOM from "react-dom";

import { WalletSelector } from "../wallet-selector.types";
import { WalletSelectorModal, ModalOptions } from "./modal.types";
import { Modal } from "./components/Modal";

const MODAL_ELEMENT_ID = "near-wallet-selector-modal";

export const setupModal = (
  // TODO: Remove omit once modal is a separate package.
  selector: Omit<WalletSelector, keyof WalletSelectorModal>,
  options?: ModalOptions
): WalletSelectorModal => {
  const el = document.createElement("div");
  el.id = MODAL_ELEMENT_ID;
  document.body.appendChild(el);

  const render = (visible = false) => {
    ReactDOM.render(
      <Modal
        selector={selector}
        options={options}
        visible={visible}
        hide={() => render(false)}
      />,
      document.getElementById(MODAL_ELEMENT_ID)
    );
  };

  render();

  return {
    show: () => {
      render(true);
    },
    hide: () => {
      render(false);
    },
  };
};
