<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('printers', function (Blueprint $table) {
            $table->char('id', 26)->primary();
            $table->char('tenant_id', 26);
            $table->char('shop_id', 26);
            $table->char('print_agent_id', 26)->nullable();
            $table->string('name', 255);
            $table->string('system_name', 255)->nullable();
            $table->string('driver_name', 255)->default('Generic / Text Only');
            $table->string('connection_type', 32)->default('usb'); // usb, network, virtual
            $table->boolean('is_default')->default(false);
            $table->boolean('is_online')->default(true);
            $table->json('capabilities')->nullable(); // color, duplex, supported_paper_sizes, trays
            $table->string('status', 32)->default('ready'); // ready, error, offline, online, disabled
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
            $table->foreign('shop_id')->references('id')->on('shops')->onDelete('cascade');
            $table->foreign('print_agent_id')->references('id')->on('print_agents')->onDelete('set null');

            $table->index(['tenant_id', 'shop_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('printers');
    }
};
