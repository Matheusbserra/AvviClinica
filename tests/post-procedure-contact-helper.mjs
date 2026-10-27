// The procedure remains an identifiable list item; actions now belong to its day/stage contact block.
export function taskContact(page, appointment, service, stage) {
 return page.getByTestId(`post-contact-${appointment}-${service}-${stage}`).locator('xpath=ancestor::section[@data-post-contact-group][1]');
}
