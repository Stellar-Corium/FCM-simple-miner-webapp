import { Component, ElementRef, inject, ViewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { BehaviorSubject, combineLatest, distinctUntilChanged, Observable, Subscription, switchMap, timer } from 'rxjs';
import { AppService, Block, State } from './app.service';
import { AsyncPipe, SlicePipe } from '@angular/common';
import { Buffer } from 'buffer';
import { nativeToScVal } from '@stellar/stellar-sdk';
import sha3 from 'js-sha3';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ReactiveFormsModule, AsyncPipe, SlicePipe],
  template: `
    <section class="mx-auto grid min-h-full w-full max-w-2xl grid-rows-[auto_1fr] gap-[1rem]">
      <div class="flex w-full items-center justify-between rounded-b-2xl bg-gray-100 p-[1rem]">
        <h1 class="w-full text-center font-semibold"><b>FCM</b> Simple Miner</h1>
      </div>

      <div class="mb-[40%] flex w-full items-center justify-center px-[1rem]">
        @if (xdr$ | async; as xdr) {
          <div class="flex min-h-[15rem] w-full max-w-sm flex-col rounded-2xl bg-gray-100 p-[1rem]">
            <h1 class="mb-[1rem] block w-full text-center font-bold">
              Copy this XDR and use the stellar lab to send it, QUICK!! another miner could send it before you.
            </h1>

            <p class="text-wrap break-all">{{ xdr }}</p>
          </div>
        } @else {
          <form
            [formGroup]="form"
            class="flex min-h-[15rem] w-full max-w-sm flex-col justify-between rounded-2xl bg-gray-100 p-[1rem]">
            <input
              [maxlength]="60"
              formControlName="source"
              class="mb-[1rem] w-full rounded-xl border-2 border-gray-200 bg-transparent px-[1rem] py-[0.5rem]"
              type="text"
              placeholder="Your PUBLIC key" />

            <input
              [maxlength]="60"
              formControlName="message"
              class="mb-[1rem] w-full rounded-xl border-2 border-gray-200 bg-transparent px-[1rem] py-[0.5rem]"
              type="text"
              placeholder="A message to print in the block" />

            <p><b>Mining block</b>: {{ (state$ | async)?.block?.index?.toString() }}</p>
            <p><b>Generated hash</b>: {{ form.value.hash | slice: 0 : 8 }}...{{ form.value.hash | slice: -8 }}</p>
            <p class="mb-[1rem]"><b>Current Attempt</b>: {{ form.value.nonce }}</p>

            @if (miningToggle$ | async) {
              <button
                class="rounded-xl border-2 border-gray-200 bg-neutral-900 px-[1rem] py-[0.5rem] font-semibold text-neutral-100 active:opacity-60"
                (click)="miningToggle$.next(false)"
                type="button">
                Stop mining
              </button>
            } @else {
              <button
                [disabled]="form.controls.source.invalid"
                [class.opacity-60]="form.controls.source.invalid"
                class="rounded-xl border-2 border-gray-200 bg-neutral-900 px-[1rem] py-[0.5rem] font-semibold text-neutral-100 active:opacity-60"
                (click)="startMining()"
                type="button">
                @if (form.controls.source.invalid) {
                  Add your public key to start mining
                } @else {
                  Start mining
                }
              </button>
            }
          </form>
        }
      </div>
    </section>

    <div
      class="fixed left-0 top-0 -z-10 h-full w-full bg-cover bg-center bg-no-repeat opacity-30"
      style="background-image: url('https://raw.githubusercontent.com/Stellar-Corium/FCM-sc/refs/heads/main/miners.png')"></div>
  `,
  styles: `
    :host {
      @apply block h-screen w-screen;
    }
  `,
})
export class AppComponent {
  appService: AppService = inject(AppService);

  @ViewChild('buttonContainer') buttonContainer?: ElementRef<HTMLElement>;

  xdr$: BehaviorSubject<string | null> = new BehaviorSubject<string | null>(null);
  miningToggle$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  state$: Observable<{ block: Block; state: State }> = timer(1000, 8000).pipe(
    switchMap(() => this.appService.fetchLatestBlock()),
    distinctUntilChanged((previous, current) => previous.state.current === current.state.current)
  );

  form: FormGroup<IForm> = new FormGroup<IForm>({
    source: new FormControl<string | null>('', Validators.required),
    message: new FormControl<string | null>('', [Validators.required, Validators.maxLength(64)]),
    nonce: new FormControl<number | null>(0, Validators.required),
    hash: new FormControl<string | null>('', Validators.required),
  });

  mineHashSubscription: Subscription = combineLatest([this.state$, this.miningToggle$]).subscribe({
    next: async ([coreData, miningToggle]) => {
      if (miningToggle) {
        let found = false;
        let nonce = 0;
        let hash = '';

        while (!found && this.miningToggle$.getValue()) {
          await new Promise(r => {
            setTimeout(() => {
              const bytes = Buffer.concat([
                nativeToScVal(coreData.state.current + 1n, { type: 'u64' }).toXDR(),
                nativeToScVal(this.form.value.message, { type: 'string' }).toXDR(),
                nativeToScVal(coreData.block.hash, { type: 'bytes' }).toXDR(),
                nativeToScVal(nonce, { type: 'u64' }).toXDR(),
                nativeToScVal(this.form.value.source, { type: 'address' }).toXDR(),
              ]);
              hash = sha3.keccak256(bytes);
              found = hash
                .slice(0, coreData.state.difficulty)
                .split('')
                .every((digit: string): boolean => digit === '0');
              if (!found) nonce++;
              r(0);
            }, 0);
          });
          this.form.controls.nonce.setValue(nonce);
          this.form.controls.hash.setValue(hash);
        }

        const xdr = await this.appService.generateXDR({
          miner: this.form.value.source!,
          hash: Buffer.from(hash, 'hex'),
          message: this.form.value.message!,
          nonce,
        });
        this.xdr$.next(xdr);
        this.miningToggle$.next(false);
      } else {
        console.log('Hey there!');
      }
    },
  });

  async startMining() {
    this.form.controls.nonce.setValue(0);
    this.miningToggle$.next(true);
  }
}

export interface IForm {
  source: FormControl<string | null>;
  message: FormControl<string | null>;
  nonce: FormControl<number | null>;
  hash: FormControl<string | null>;
}
