import { css } from 'styled-components';

export default css`
  .ProfilePreviews,
  .FullProfile {
    .item {
      .image {
        padding: 0 !important;
      }
      .description {
        font-size: 1rem;
      }
    }
  }
  .ProfilePreviews {
    &.ui.list>.item:first-child {
      padding-top: .75rem;
    }
    &.ui.list>.item:last-child {
      padding-bottom: .75rem;
    }
    .MyProfile {
      background-color: #FFF8E1;
    }
  }
  .ProfileDetails {
    padding-left: 1rem !important;
    .handle {
      margin-right: 1rem;
      .button {
        padding: .5rem .75rem;
      }
    }
  }
  .ProfileDetailsTable {
    font-size: 1rem !important;
    tr td:first-child {
      width: 1%;
      white-space: nowrap;
    }
  }

  .JoyMemberPreview {
    margin-right: .5rem;
    .PrefixLabel {
      margin-right: .5rem;
    }
    .Avatar {
      margin-right: .5rem;
      border-radius: 100%;
    }
    .Content {
      .Username {
        font-weight: bold;
      }
      .Details {
        font-weight: 100;
        opacity: .75;
      }
    }
  }
`;
